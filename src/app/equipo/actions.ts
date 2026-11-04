'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { categoria, sumar } from '@/lib/escala';
import { periodoActual } from '@/lib/periodos';
import { requerirUsuario } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';

export interface DatosEvaluacion {
  legajo: string;
  puntajes: (number | null)[];
  agrupamiento: string | null;
  observaciones: string;
  enviar: boolean;
}

function traducir(mensaje: string) {
  if (/row-level security/i.test(mensaje)) return 'Esta persona no figura en tu equipo para este período.';
  return mensaje;
}

// Guarda borrador o envía. Las reglas (1 a 10, completa para enviar, período abierto)
// las vuelve a controlar la base de datos.
export async function guardarEvaluacion(d: DatosEvaluacion): Promise<{ error: string }> {
  const usuario = await requerirUsuario();
  const supabase = await clienteServidor();
  const periodo = await periodoActual(supabase);
  if (!periodo || periodo.estado !== 'abierto') return { error: 'El período de evaluación no está abierto.' };

  const puntajes = d.puntajes.map((v) => (v == null ? null : Math.trunc(Number(v))));
  const observaciones = String(d.observaciones ?? '').slice(0, 600);

  const { data: previa } = await supabase
    .from('evaluaciones')
    .select('estado')
    .eq('periodo_id', periodo.id)
    .eq('legajo', d.legajo)
    .maybeSingle();
  const estado = d.enviar || previa?.estado === 'enviada' ? 'enviada' : 'borrador';

  const { error } = await supabase.from('evaluaciones').upsert(
    {
      periodo_id: periodo.id,
      legajo: d.legajo,
      evaluador_id: usuario.id,
      puntajes,
      agrupamiento: d.agrupamiento || null,
      observaciones,
      estado,
    },
    { onConflict: 'periodo_id,legajo' },
  );
  if (error) return { error: traducir(error.message) };

  revalidatePath('/equipo');
  const total = sumar(puntajes);
  const aviso = estado === 'enviada'
    ? `${previa?.estado === 'enviada' ? 'Cambios guardados' : 'Evaluación enviada'}: ${total} puntos, ${categoria(total).nombre}.`
    : 'Borrador guardado. Podés seguir cuando quieras.';
  redirect(`/equipo?marcado=${encodeURIComponent(d.legajo)}&aviso=${encodeURIComponent(aviso)}`);
}

export interface AgenteEncontrado { nombre: string; unidad: string; enEquipo: boolean }

export async function consultarLegajo(legajo: string): Promise<AgenteEncontrado | { error: string }> {
  const usuario = await requerirUsuario();
  const supabase = await clienteServidor();
  const limpio = legajo.replace(/\D/g, '');
  const { data } = await supabase.rpc('buscar_agente', { p_legajo: limpio });
  const a = (data as { nombre: string; unidad_nombre: string }[] | null)?.[0];
  if (!a) return { error: `No encontramos el legajo ${limpio} en el padrón. Revisá el número.` };
  const periodo = await periodoActual(supabase);
  const { data: mio } = periodo
    ? await supabase.from('padron_periodo').select('legajo').eq('periodo_id', periodo.id).eq('legajo', limpio).eq('evaluador_id', usuario.id).maybeSingle()
    : { data: null };
  return { nombre: a.nombre, unidad: a.unidad_nombre, enEquipo: !!mio };
}

export async function pedirAgente(legajo: string, motivo: string): Promise<{ error?: string; ok?: boolean }> {
  const usuario = await requerirUsuario();
  const supabase = await clienteServidor();
  const periodo = await periodoActual(supabase);
  if (!periodo || periodo.estado !== 'abierto') return { error: 'El período de evaluación no está abierto.' };
  const limpio = legajo.replace(/\D/g, '');
  const { data } = await supabase.rpc('buscar_agente', { p_legajo: limpio });
  const a = (data as { nombre: string }[] | null)?.[0];
  if (!a) return { error: 'No encontramos ese legajo en el padrón.' };
  const { data: porQue } = await supabase.rpc('motivo_no_evaluable', { p_legajo: limpio });
  if (porQue) return { error: `${a.nombre} no se evalúa en este sistema (${porQue === 'funcionario' ? 'es funcionario' : porQue === 'convenio' ? 'es de convenio 5' : 'su legajo no es de 5 dígitos'}).` };

  const { data: repetida } = await supabase
    .from('solicitudes')
    .select('id')
    .eq('periodo_id', periodo.id)
    .eq('legajo', limpio)
    .eq('solicitante_id', usuario.id)
    .eq('estado', 'pendiente')
    .maybeSingle();
  if (repetida) return { error: `Ya pediste sumar a ${a.nombre}. Capital Humano lo está revisando.` };

  const { error } = await supabase.from('solicitudes').insert({
    periodo_id: periodo.id,
    legajo: limpio,
    nombre: a.nombre,
    solicitante_id: usuario.id,
    motivo: motivo.slice(0, 200),
  });
  if (error) return { error: 'No pudimos enviar la solicitud. Probá de nuevo.' };
  revalidatePath('/equipo');
  return { ok: true };
}
