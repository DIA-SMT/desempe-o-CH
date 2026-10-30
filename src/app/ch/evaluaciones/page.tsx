import Link from 'next/link';
import { ChipCategoria } from '@/components/Escala';
import { Filtros } from '@/components/Filtros';
import { datosPeriodo, evaluadores } from '@/lib/datos-ch';
import { respondidas } from '@/lib/escala';
import { f0, normalizar } from '@/lib/formato';
import { fecha, periodoActual, periodoAnterior } from '@/lib/periodos';
import { puedeVerRespuestas, requerirCH } from '@/lib/sesion';
import { clienteAdmin } from '@/lib/supabase/admin';

const POR_PAGINA = 50;

export default async function Evaluaciones({ searchParams }: {
  searchParams: Promise<{ q?: string; secretaria?: string; estado?: string; pagina?: string }>;
}) {
  const usuario = await requerirCH();
  const ve = puedeVerRespuestas(usuario);
  const { q = '', secretaria = '', estado = '', pagina = '1' } = await searchParams;
  const db = clienteAdmin();
  const periodo = await periodoActual(db);
  if (!periodo) return <section className="card vacio"><h2>Todavía no hay un período de evaluación</h2></section>;

  const anterior = ve ? await periodoAnterior(db, periodo) : null;
  const [D, P, usuarios] = await Promise.all([datosPeriodo(periodo.id), anterior ? datosPeriodo(anterior.id) : null, evaluadores()]);
  const ev = new Map(D.evaluaciones.map((e) => [e.legajo, e]));
  const prev = new Map((P?.evaluaciones ?? []).filter((e) => e.estado === 'enviada').map((e) => [e.legajo, e.total]));

  const t = normalizar(q.trim());
  const filas = D.padron
    .filter((a) => !secretaria || a.secretaria === secretaria)
    .filter((a) => !estado || (ev.get(a.legajo)?.estado ?? 'pendiente') === estado)
    .filter((a) => !t || a.legajo.includes(t) || normalizar(a.nombre).includes(t))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const pag = Math.min(Math.max(1, Number(pagina) || 1), paginas);
  const visibles = filas.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);
  const secretarias = [...new Set(D.padron.map((a) => a.secretaria).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, 'es'));

  const enlace = (n: number) => {
    const p = new URLSearchParams({ ...(q && { q }), ...(secretaria && { secretaria }), ...(estado && { estado }), pagina: String(n) });
    return `/ch/evaluaciones?${p}`;
  };

  return (
    <>
      {!ve && (
        <p className="banner">
          Ves el estado de cada evaluación. Los puntajes individuales los ven la Dirección de Capital Humano y los encargados habilitados.
        </p>
      )}
      <Filtros
        campos={[
          { nombre: 'q', etiqueta: 'Buscar por legajo o nombre' },
          { nombre: 'secretaria', etiqueta: 'Secretaría', todas: 'Todas', opciones: secretarias.map((s) => ({ valor: s, texto: s })) },
          { nombre: 'estado', etiqueta: 'Estado', todas: 'Todos', opciones: [
            { valor: 'enviada', texto: 'Enviadas' }, { valor: 'borrador', texto: 'Borradores' }, { valor: 'pendiente', texto: 'Sin evaluar' },
          ] },
        ]}
        resumen={`${f0(filas.length)} de ${f0(D.padron.length)} agentes`}
      />
      {visibles.length === 0 ? (
        <p className="card" style={{ padding: '18px 20px', color: 'var(--ink-2)' }}>Ningún agente coincide con los filtros.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Legajo</th><th>Apellido y nombre</th><th>Unidad</th><th>Evaluador/a</th><th>Estado</th>
                {ve && <><th className="num">Puntaje</th>{anterior && <th className="num">{anterior.nombre}</th>}<th /></>}
              </tr>
            </thead>
            <tbody>
              {visibles.map((a) => {
                const e = ev.get(a.legajo);
                const p = prev.get(a.legajo);
                return (
                  <tr key={a.legajo}>
                    <td className="num">{a.legajo}</td>
                    <td><strong>{a.nombre}</strong></td>
                    <td>{a.unidad_nombre}<span className="sm">{a.secretaria}</span></td>
                    <td>{a.evaluador_id ? usuarios.get(a.evaluador_id)?.nombre ?? '—' : <span className="pill bad">Sin evaluador</span>}</td>
                    <td className="nowrap">
                      {!e ? <span className="pill">Sin evaluar</span>
                        : e.estado === 'borrador' ? <span className="pill warn">Borrador · {respondidas(e.puntajes)}/10</span>
                        : <span className="pill ok">Enviada {e.enviada_en ? fecha(e.enviada_en).slice(0, 5) : ''}</span>}
                    </td>
                    {ve && (
                      <>
                        <td className="num">{e?.estado === 'enviada' ? <>{e.total} <ChipCategoria total={e.total} /></> : '—'}</td>
                        {anterior && <td className="num">{p ?? <span className="muted">Sin datos</span>}</td>}
                        <td className="num">{(e || p != null) && <Link className="btn sm" href={`/ch/evaluaciones/${encodeURIComponent(a.legajo)}`}>Ver</Link>}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {paginas > 1 && (
        <div className="paginas">
          <span>Página {pag} de {paginas}</span>
          <div>
            {pag > 1 && <Link className="btn sm" href={enlace(pag - 1)}>← Anterior</Link>}
            {pag < paginas && <Link className="btn sm" href={enlace(pag + 1)}>Siguiente →</Link>}
          </div>
        </div>
      )}
    </>
  );
}
