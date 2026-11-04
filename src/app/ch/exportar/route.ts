import { NextResponse, type NextRequest } from 'next/server';
import { esSinMail } from '@/lib/cidituc';
import { datosPeriodo, evaluadores } from '@/lib/datos-ch';
import { categoria, nombreAgrupamiento } from '@/lib/escala';
import { fecha, periodoActual, periodoAnterior } from '@/lib/periodos';
import { esCH, puedeVerRespuestas, usuarioActual } from '@/lib/sesion';
import { clienteAdmin } from '@/lib/supabase/admin';
import { clienteServidor } from '@/lib/supabase/servidor';

// Descarga para Excel (CSV con separador ";"). El avance (estados) lo baja todo Capital Humano;
// los resultados con puntajes individuales, solo quien puede verlos, y queda registrado en auditoría.
const celda = (v: string | number | null | undefined) => {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(request: NextRequest) {
  const usuario = await usuarioActual();
  if (!usuario || !esCH(usuario)) return new NextResponse('No autorizado', { status: 403 });
  const tipo = request.nextUrl.searchParams.get('tipo') === 'resultados' ? 'resultados' : 'avance';
  if (tipo === 'resultados' && !puedeVerRespuestas(usuario)) return new NextResponse('No autorizado', { status: 403 });
  const secretaria = request.nextUrl.searchParams.get('secretaria') ?? '';

  const db = clienteAdmin();
  const periodo = await periodoActual(db);
  if (!periodo) return new NextResponse('No hay un período de evaluación', { status: 404 });
  const anterior = tipo === 'resultados' ? await periodoAnterior(db, periodo) : null;
  const [D, P, usuarios] = await Promise.all([datosPeriodo(periodo.id), anterior ? datosPeriodo(anterior.id) : null, evaluadores()]);
  const ev = new Map(D.evaluaciones.map((e) => [e.legajo, e]));
  const prev = new Map((P?.evaluaciones ?? []).filter((e) => e.estado === 'enviada').map((e) => [e.legajo, e.total]));
  const padron = D.padron.filter((a) => !secretaria || a.secretaria === secretaria).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const encabezado = ['Legajo', 'Apellido y nombre', 'Secretaría', 'Unidad', 'Evaluador/a', 'Mail del evaluador', 'Estado', 'Fecha de envío'];
  if (tipo === 'resultados') {
    encabezado.push('Agrupamiento', ...D.competencias.map((c) => c.nombre), 'Total', 'Categoría');
    if (anterior) encabezado.push(`Total ${anterior.nombre}`);
  }
  const filas = padron.map((a) => {
    const e = ev.get(a.legajo);
    const u = a.evaluador_id ? usuarios.get(a.evaluador_id) : null;
    const enviada = e?.estado === 'enviada';
    const fila: (string | number | null | undefined)[] = [
      a.legajo, a.nombre, a.secretaria, a.unidad_nombre, u?.nombre ?? 'Sin evaluador', esSinMail(u?.email) ? '' : u?.email,
      enviada ? 'Enviada' : e ? 'Borrador' : 'Sin evaluar', enviada && e.enviada_en ? fecha(e.enviada_en) : '',
    ];
    if (tipo === 'resultados') {
      fila.push(enviada ? nombreAgrupamiento(e.agrupamiento) : '', ...D.competencias.map((_, i) => (enviada ? e.puntajes[i] : '')),
        enviada ? e.total : '', enviada ? categoria(e.total).nombre : '');
      if (anterior) fila.push(prev.get(a.legajo) ?? '');
    }
    return fila;
  });

  if (tipo === 'resultados') {
    const supabase = await clienteServidor();
    await supabase.from('auditoria').insert({ usuario_id: usuario.id, accion: 'exportar_resultados', detalle: { periodo_id: periodo.id, secretaria: secretaria || null, filas: filas.length } });
  }

  const csv = '﻿' + [encabezado, ...filas].map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n';
  const nombre = `${tipo === 'resultados' ? 'resultados' : 'avance'} ${periodo.nombre}${secretaria ? ` - ${secretaria}` : ''}.csv`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="evaluacion.csv"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'Cache-Control': 'no-store',
    },
  });
}
