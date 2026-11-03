import { NextResponse, type NextRequest } from 'next/server';
import { MANUAL, situacion, type ContextoAsistente } from '@/lib/asistente';
import { periodoActual, textoCierre } from '@/lib/periodos';
import { esCH, usuarioActual, type Usuario } from '@/lib/sesion';
import { clienteAdmin } from '@/lib/supabase/admin';
import { clienteServidor } from '@/lib/supabase/servidor';

// Migue, el asistente. GET: datos para las preguntas rápidas. POST: respuesta a una pregunta libre,
// generada por un modelo vía OpenRouter y enviada de a partes (texto plano).

const MODELO = process.env.OPENROUTER_MODEL || 'anthropic/claude-opus-5.5';
const LIMITE_DIARIO = 40;
const MAX_MENSAJES = 10;
const MAX_LARGO = 1000;

async function contexto(usuario: Usuario): Promise<ContextoAsistente> {
  const ch = esCH(usuario);
  const supabase = await clienteServidor();
  const periodo = await periodoActual(supabase);
  if (!periodo) return { ch, periodo: null, avance: null };

  // Director: su equipo, leído con su sesión (RLS). Capital Humano: todo el período.
  const db = ch ? clienteAdmin() : supabase;
  const contar = (tabla: 'padron_periodo' | 'evaluaciones', estado?: 'enviada' | 'borrador') => {
    let q = db.from(tabla).select('*', { count: 'exact', head: true }).eq('periodo_id', periodo.id);
    if (estado) q = q.eq('estado', estado);
    if (!ch) q = q.eq('evaluador_id', usuario.id);
    return q;
  };
  const [{ count: total }, { count: enviadas }, { count: borradores }] = await Promise.all([
    contar('padron_periodo'), contar('evaluaciones', 'enviada'), contar('evaluaciones', 'borrador'),
  ]);
  return {
    ch,
    periodo: { nombre: periodo.nombre, texto: textoCierre(periodo), abierto: periodo.estado === 'abierto' },
    avance: { total: total ?? 0, enviadas: enviadas ?? 0, borradores: borradores ?? 0 },
  };
}

export async function GET() {
  const usuario = await usuarioActual();
  if (!usuario) return NextResponse.json({ error: 'Iniciá sesión' }, { status: 401 });
  return NextResponse.json({ ...(await contexto(usuario)), disponible: !!process.env.OPENROUTER_API_KEY });
}

interface Mensaje { rol: 'usuario' | 'migue'; texto: string }

const texto = (t: string, status: number) => new Response(t, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export async function POST(request: NextRequest) {
  const usuario = await usuarioActual();
  if (!usuario) return texto('Iniciá sesión para hablar con Migue.', 401);
  const clave = process.env.OPENROUTER_API_KEY;
  if (!clave) return texto('Ahora no puedo responder preguntas escritas. Probá con las preguntas rápidas.', 503);

  const cuerpo = (await request.json().catch(() => null)) as { mensajes?: Mensaje[] } | null;
  const historial = (Array.isArray(cuerpo?.mensajes) ? cuerpo.mensajes : [])
    .filter((m) => (m.rol === 'usuario' || m.rol === 'migue') && typeof m.texto === 'string' && m.texto.trim())
    .slice(-MAX_MENSAJES)
    .map((m) => ({ role: m.rol === 'usuario' ? 'user' as const : 'assistant' as const, content: m.texto.slice(0, MAX_LARGO) }));
  while (historial[0]?.role === 'assistant') historial.shift();
  if (historial.at(-1)?.role !== 'user') return texto('No llegó ninguna pregunta.', 400);

  // Límite de preguntas por persona y por día (hora de Argentina)
  const admin = clienteAdmin();
  const hoy = new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10);
  const { count } = await admin.from('consultas_asistente').select('id', { count: 'exact', head: true })
    .eq('usuario_id', usuario.id).gte('creada_en', `${hoy}T00:00:00-03:00`);
  if ((count ?? 0) >= LIMITE_DIARIO) {
    return texto(`Por hoy llegaste al límite de ${LIMITE_DIARIO} preguntas. Mañana seguimos; mientras tanto, usá las preguntas rápidas.`, 429);
  }
  await admin.from('consultas_asistente').insert({ usuario_id: usuario.id });

  const respuesta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: request.signal,
    headers: {
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
      'X-Title': 'Evaluación de Desempeño',
    },
    body: JSON.stringify({
      model: MODELO,
      stream: true,
      max_tokens: 1500,
      reasoning: { effort: 'low', exclude: true },
      provider: { data_collection: 'deny' }, // solo proveedores que no guardan ni entrenan con los datos
      messages: [
        {
          role: 'system',
          content: [
            { type: 'text', text: MANUAL, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: situacion(await contexto(usuario)) },
          ],
        },
        ...historial,
      ],
    }),
  }).catch((e: unknown) => {
    console.error('Migue: no se pudo llamar a OpenRouter:', e);
    return null;
  });
  if (!respuesta?.ok || !respuesta.body) {
    if (respuesta) console.error('Migue: OpenRouter respondió', respuesta.status, await respuesta.text().catch(() => ''));
    return texto(`Ahora no puedo responder. Probá de nuevo en un rato o consultá a la Dirección de Capital Humano.`, 502);
  }

  // OpenRouter manda eventos "data: {...}"; reenviamos solo el texto de la respuesta
  const lector = respuesta.body.pipeThrough(new TextDecoderStream()).getReader();
  const codificar = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let resto = '';
      try {
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          const lineas = (resto + value).split('\n');
          resto = lineas.pop() ?? '';
          for (const linea of lineas) {
            if (!linea.startsWith('data:')) continue; // comentarios de "procesando"
            const dato = linea.slice(5).trim();
            if (dato === '[DONE]') { controller.close(); return; }
            const evento = JSON.parse(dato) as { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
            if (evento.error) throw new Error(evento.error.message ?? 'error de OpenRouter');
            const parte = evento.choices?.[0]?.delta?.content;
            if (parte) controller.enqueue(codificar.encode(parte));
          }
        }
        controller.close();
      } catch (e) {
        console.error('Migue: se cortó la respuesta:', e);
        controller.enqueue(codificar.encode('\n\n(Se cortó la respuesta. Probá de nuevo.)'));
        controller.close();
      }
    },
    cancel() { lector.cancel().catch(() => {}); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
