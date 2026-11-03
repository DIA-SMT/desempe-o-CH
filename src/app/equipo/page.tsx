import { Barras, TablaBarras, type FilaBarra } from '@/components/Graficos';
import { Migue } from '@/components/Migue';
import { TarjetaGrafico } from '@/components/TarjetaGrafico';
import { MAIL_CH } from '@/lib/contacto';
import { respondidas } from '@/lib/escala';
import { f1, promedio } from '@/lib/formato';
import { fecha, periodoActual, textoCierre } from '@/lib/periodos';
import { requerirUsuario } from '@/lib/sesion';
import { traerTodo } from '@/lib/supabase/admin';
import { clienteServidor } from '@/lib/supabase/servidor';
import type { FilaEvaluacion, FilaPadron } from '@/lib/tipos';
import { ListaEquipo, type FilaEquipo } from './ListaEquipo';
import { SolicitudAgente, type SolicitudPropia } from './SolicitudAgente';

interface HistorialPersona { legajo: string; periodo_id: number; periodo: string; cierre: string; total: number }
interface ResumenEquipo { periodo_id: number; periodo: string; cierre: string; evaluadas: number; promedio: number | null }

export default async function Equipo({ searchParams }: { searchParams: Promise<{ marcado?: string }> }) {
  const usuario = await requerirUsuario();
  const { marcado } = await searchParams;
  const supabase = await clienteServidor();
  const periodo = await periodoActual(supabase);

  if (!periodo || periodo.estado !== 'abierto') {
    return (
      <section className="card vacio">
        <Migue />
        <h1>No hay una evaluación abierta</h1>
        <p className="sub">Cuando Capital Humano abra el próximo período de evaluación, vas a ver acá a la gente que tenés a cargo.</p>
      </section>
    );
  }

  // RLS: cada director ve solo a su equipo y sus propias evaluaciones.
  // Los semestres anteriores llegan por funciones que aplican la misma regla.
  const [equipo, evaluaciones, { data: solicitudes }, { data: hist }, { data: res }] = await Promise.all([
    traerTodo<FilaPadron>((d, h) =>
      supabase.from('padron_periodo').select('legajo, nombre, unidad_codigo, unidad_nombre, secretaria, evaluador_id')
        .eq('periodo_id', periodo.id).eq('evaluador_id', usuario.id).order('nombre').range(d, h)),
    traerTodo<FilaEvaluacion>((d, h) =>
      supabase.from('evaluaciones').select('legajo, estado, total, puntajes, agrupamiento, evaluador_id, enviada_en, actualizada_en')
        .eq('periodo_id', periodo.id).eq('evaluador_id', usuario.id).range(d, h)),
    supabase.from('solicitudes').select('id, legajo, nombre, motivo, estado').eq('periodo_id', periodo.id)
      .eq('solicitante_id', usuario.id).order('creada_en', { ascending: false }),
    supabase.rpc('historial_equipo', { p_periodo: periodo.id }),
    supabase.rpc('resumen_equipo', { p_periodo: periodo.id }),
  ]);
  const historial = (hist ?? []) as HistorialPersona[];
  const resumen = (res ?? []) as ResumenEquipo[];

  // Último semestre anterior de cada persona (solo de quienes ya tienen enviada la de este período)
  const anterior = new Map(historial.map((h) => [h.legajo, { periodo: h.periodo, total: h.total }]));
  const porLegajo = new Map(evaluaciones.map((e) => [e.legajo, e]));
  const filas: FilaEquipo[] = equipo.map((a) => {
    const e = porLegajo.get(a.legajo);
    return {
      legajo: a.legajo,
      nombre: a.nombre,
      unidad: a.unidad_nombre,
      estado: e?.estado ?? 'pendiente',
      total: e?.total ?? 0,
      respondidas: e ? respondidas(e.puntajes) : 0,
      fecha: e?.estado === 'enviada' && e.enviada_en ? fecha(e.enviada_en).slice(0, 5) : null,
      anterior: anterior.get(a.legajo) ?? null,
    };
  });

  // Promedio del equipo en cada semestre anterior y en este, con lo enviado hasta ahora
  const propias = evaluaciones.filter((e) => e.estado === 'enviada').map((e) => e.total);
  const semestres: FilaBarra[] = [
    ...resumen.map((r) => ({ label: r.periodo, now: r.promedio == null ? null : Number(r.promedio), prev: null, nNow: r.evaluadas })),
    ...(propias.length ? [{ label: `${periodo.nombre} (en curso)`, now: promedio(propias), prev: null, nNow: propias.length }] : []),
  ];

  const unidades = [...new Set(equipo.map((a) => a.unidad_nombre))];
  const secretarias = [...new Set(equipo.map((a) => a.secretaria).filter(Boolean))];
  const enviadas = filas.filter((f) => f.estado === 'enviada').length;
  const borradores = filas.filter((f) => f.estado === 'borrador').length;

  return (
    <>
      <section className="page-head">
        <p className="eyebrow">{secretarias.join(' · ') || 'Tu equipo'}</p>
        <h1>{unidades.length === 1 ? unidades[0] : 'Tu equipo'}</h1>
        <p className="sub">Período {periodo.nombre}, {textoCierre(periodo)}.</p>
        {filas.length > 0 && (
          <div className="progress">
            <div className="meter" role="img" aria-label={`${enviadas} de ${filas.length} enviadas`}>
              <span style={{ width: `${(enviadas / filas.length) * 100}%` }} />
            </div>
            <p>
              <strong>{enviadas} de {filas.length}</strong> evaluaciones enviadas{borradores ? ` · ${borradores} en borrador` : ''}
            </p>
          </div>
        )}
      </section>

      {filas.length > 0 && enviadas === filas.length && (
        <section className="card done-card">
          <Migue />
          <div>
            <h2>¡Listo! Evaluaste a todo tu equipo.</h2>
            <p className="sub">Gracias. Podés revisar o corregir cualquier evaluación hasta el {fecha(periodo.cierre)}.</p>
          </div>
        </section>
      )}

      {filas.length === 0 ? (
        <section className="card vacio" style={{ marginBottom: 16 }}>
          <h2>Todavía no tenés personas a cargo en este período</h2>
          <p className="sub">
            Si sos director o directora de un área y esperabas ver a tu equipo, avisale a Capital Humano
            (<a href={`mailto:${MAIL_CH}`}>{MAIL_CH}</a>). Mientras tanto
            podés pedir que sumen a alguien con su legajo.
          </p>
        </section>
      ) : (
        <ListaEquipo filas={filas} marcado={marcado} />
      )}

      {resumen.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <TarjetaGrafico titulo="Tu equipo en semestres anteriores"
            subtitulo="Promedio sobre 100 de las personas que hoy tenés a cargo, con 3 o más evaluadas. El puntaje anterior de cada persona aparece en la lista cuando enviás su evaluación de este período."
            tabla={<TablaBarras filas={semestres} columna="Semestre" formato={f1} actual="Promedio" />}>
            <Barras filas={semestres} max={100} marcas={[0, 20, 40, 60, 80, 100]} formato={f1} actual="Promedio" />
          </TarjetaGrafico>
        </div>
      )}

      <SolicitudAgente solicitudes={(solicitudes ?? []) as SolicitudPropia[]} />
      <p className="muted" style={{ fontSize: '.8rem', marginTop: 16 }}>
        ¿Necesitás ayuda? Escribile a la Dirección de Capital Humano: <a href={`mailto:${MAIL_CH}`}>{MAIL_CH}</a>
      </p>
    </>
  );
}
