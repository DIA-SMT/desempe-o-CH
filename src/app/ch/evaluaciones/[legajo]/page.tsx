import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChipCategoria } from '@/components/Escala';
import { Leyenda } from '@/components/Graficos';
import { nombreCorto } from '@/lib/competencias';
import { nombreAgrupamiento, respondidas } from '@/lib/escala';
import { fecha, periodoActual, periodoAnterior } from '@/lib/periodos';
import { puedeVerRespuestas, requerirCH } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import type { FilaCompetencia } from '@/lib/tipos';

// Detalle de una evaluación. Se lee con la sesión del usuario (RLS) y queda registrado en auditoría.
export default async function Detalle({ params }: { params: Promise<{ legajo: string }> }) {
  const usuario = await requerirCH();
  if (!puedeVerRespuestas(usuario)) redirect('/ch/evaluaciones');
  const { legajo } = await params;
  const supabase = await clienteServidor();
  const periodo = await periodoActual(supabase);
  if (!periodo) notFound();
  const anterior = await periodoAnterior(supabase, periodo);

  const [{ data: agente }, { data: ev }, { data: comps }, prevRes, compsPrevRes] = await Promise.all([
    supabase.from('padron_periodo').select('legajo, nombre, unidad_nombre, secretaria, evaluador_id').eq('periodo_id', periodo.id).eq('legajo', legajo).maybeSingle(),
    supabase.from('evaluaciones').select('puntajes, total, estado, agrupamiento, observaciones, enviada_en, actualizada_en, evaluador_id').eq('periodo_id', periodo.id).eq('legajo', legajo).maybeSingle(),
    supabase.from('competencias').select('orden, tipo, nombre, descripcion').eq('periodo_id', periodo.id).order('orden'),
    anterior ? supabase.from('evaluaciones').select('puntajes, total, estado').eq('periodo_id', anterior.id).eq('legajo', legajo).maybeSingle() : Promise.resolve({ data: null }),
    anterior ? supabase.from('competencias').select('orden, nombre').eq('periodo_id', anterior.id).order('orden') : Promise.resolve({ data: [] }),
  ]);
  if (!agente) notFound();

  const { data: evaluador } = agente.evaluador_id
    ? await supabase.from('usuarios').select('nombre').eq('id', agente.evaluador_id).maybeSingle()
    : { data: null };
  await supabase.from('auditoria').insert({ usuario_id: usuario.id, accion: 'ver_evaluacion', detalle: { periodo_id: periodo.id, legajo } });

  const competencias = (comps ?? []) as FilaCompetencia[];
  const prev = prevRes.data?.estado === 'enviada' ? (prevRes.data.puntajes as number[]) : null;
  const idxPrev = new Map(((compsPrevRes.data ?? []) as { nombre: string }[]).map((c, i) => [c.nombre, i]));
  const enviada = ev?.estado === 'enviada';

  return (
    <>
      <Link href="/ch/evaluaciones" className="btn ghost">← Volver a evaluaciones</Link>
      <section className="card modal" style={{ width: '100%', maxWidth: 760, boxShadow: 'none' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <p className="eyebrow">Legajo {agente.legajo} · {nombreAgrupamiento(ev?.agrupamiento)}</p>
          <h1 style={{ fontSize: '1.5rem' }}>{agente.nombre}</h1>
          <p className="sub" style={{ fontSize: '.88rem' }}>{agente.unidad_nombre} · evalúa {evaluador?.nombre ?? 'sin evaluador asignado'}</p>
        </div>
        <dl className="d-tot" style={{ margin: 0 }}>
          <div>
            <dt>{periodo.nombre}</dt>
            {enviada ? <><b>{ev!.total}</b><ChipCategoria total={ev!.total} /></> : <span className="muted">{ev ? `Borrador, ${respondidas(ev.puntajes)} de 10` : 'Sin evaluar'}</span>}
          </div>
          {anterior && (
            <div>
              <dt>{anterior.nombre}</dt>
              {prevRes.data?.estado === 'enviada' ? <><b>{prevRes.data.total}</b><ChipCategoria total={prevRes.data.total} /></> : <span className="muted">Sin evaluación anterior</span>}
            </div>
          )}
          {ev && <div><dt>{enviada ? 'Enviada' : 'Guardada'}</dt><dd className="num">{fecha(enviada ? ev.enviada_en! : ev.actualizada_en)}</dd></div>}
        </dl>
        <Leyenda actual={periodo.nombre} anterior={anterior && prev ? anterior.nombre : null} />
        <div className="d-rows">
          <div className="d-row h"><span>Competencia</span><span /><span className="num">Actual</span><span className="num">Anterior</span></div>
          {competencias.map((c, i) => {
            const v = (ev?.puntajes as (number | null)[] | undefined)?.[i] ?? null;
            const j = idxPrev.get(c.nombre);
            const pv = prev && j != null ? prev[j] : null;
            return (
              <div key={c.orden} className="d-row">
                <span>{nombreCorto(c.nombre)}</span>
                <span className="bar-track">
                  <span className="gl base" style={{ left: 0 }} />
                  {v != null && <span className="bar-fill" style={{ width: `${v * 10}%` }} />}
                  {pv != null && <span className="bar-prev" style={{ left: `${pv * 10}%` }} />}
                </span>
                <span className="num">{v ?? '—'}</span>
                <span className="num muted">{pv ?? '—'}</span>
              </div>
            );
          })}
        </div>
        {ev?.observaciones && (
          <div style={{ display: 'grid', gap: 4 }}>
            <p className="lbl">Observaciones del director</p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{ev.observaciones}</p>
          </div>
        )}
      </section>
    </>
  );
}
