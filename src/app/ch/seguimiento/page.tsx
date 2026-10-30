import Link from 'next/link';
import { datosPeriodo, evaluadores } from '@/lib/datos-ch';
import { f0 } from '@/lib/formato';
import { fecha, periodoActual } from '@/lib/periodos';
import { requerirCH } from '@/lib/sesion';
import { clienteAdmin } from '@/lib/supabase/admin';
import { resolverSolicitud } from '../actions';
import { CopiarMails } from './CopiarMails';

interface Solicitud { id: number; legajo: string; nombre: string; motivo: string; estado: string; creada_en: string; solicitante_id: string }

export default async function Seguimiento() {
  await requerirCH();
  const db = clienteAdmin();
  const periodo = await periodoActual(db);
  if (!periodo || periodo.estado !== 'abierto') {
    return <section className="card vacio"><h2>El período no está abierto</h2><p className="sub">El seguimiento se activa cuando abrís el período en <Link href="/ch/configuracion">Configuración</Link>.</p></section>;
  }

  const [D, usuarios, { data: sols }] = await Promise.all([
    datosPeriodo(periodo.id),
    evaluadores(),
    db.from('solicitudes').select('id, legajo, nombre, motivo, estado, creada_en, solicitante_id').eq('periodo_id', periodo.id).order('creada_en', { ascending: false }).limit(100),
  ]);

  const estado = new Map(D.evaluaciones.map((e) => [e.legajo, e.estado]));
  const porEvaluador = new Map<string, { total: number; env: number; bor: number; unidades: Set<string> }>();
  const sinEvaluador = new Map<string, number>();
  for (const a of D.padron) {
    if (!a.evaluador_id) { sinEvaluador.set(a.unidad_nombre, (sinEvaluador.get(a.unidad_nombre) ?? 0) + 1); continue; }
    const g = porEvaluador.get(a.evaluador_id) ?? { total: 0, env: 0, bor: 0, unidades: new Set<string>() };
    g.total++; g.unidades.add(a.unidad_nombre);
    const e = estado.get(a.legajo);
    if (e === 'enviada') g.env++; else if (e === 'borrador') g.bor++;
    porEvaluador.set(a.evaluador_id, g);
  }
  const filas = [...porEvaluador.entries()].map(([id, g]) => ({ u: usuarios.get(id), id, ...g, p: g.env / g.total })).sort((a, b) => a.p - b.p);
  const pendientes = filas.filter((f) => f.p < 1);
  const totalSin = [...sinEvaluador.values()].reduce((s, n) => s + n, 0);

  const solicitudes = (sols ?? []) as Solicitud[];
  const unidadActual = new Map(D.padron.map((a) => [a.legajo, a.unidad_nombre]));

  return (
    <>
      <section className="section">
        <div className="section-h">
          <div><h2>Evaluadores</h2><p>{pendientes.length} de {filas.length} tienen evaluaciones pendientes</p></div>
          {pendientes.length > 0 && <CopiarMails mails={pendientes.map((f) => f.u?.email).filter((m): m is string => !!m)} />}
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Evaluador/a</th><th>Avance</th><th className="num">Borradores</th><th>Estado</th><th>Unidades</th></tr></thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td><strong>{f.u?.nombre ?? 'Usuario dado de baja'}</strong><span className="sm">{f.u?.email}</span></td>
                  <td><div className="cellmeter"><div className="meter"><span style={{ width: `${f.p * 100}%` }} /></div><span className="num">{f.env}/{f.total}</span></div></td>
                  <td className="num">{f.bor || '—'}</td>
                  <td>{f.p === 1 ? <span className="pill ok">Completo</span> : f.env === 0 ? <span className="pill bad">Sin empezar</span> : <span className="pill warn">En curso</span>}</td>
                  <td><span className="sm" style={{ color: 'var(--ink-2)' }}>{[...f.unidades].join(' · ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {totalSin > 0 && (
        <section className="section">
          <div className="section-h">
            <div><h2>Agentes sin evaluador</h2><p>{f0(totalSin)} agentes en {sinEvaluador.size} unidades. Cargá el evaluador de cada unidad en <Link href="/ch/configuracion">Configuración</Link>.</p></div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Unidad</th><th className="num">Agentes</th></tr></thead>
              <tbody>
                {[...sinEvaluador.entries()].sort((a, b) => b[1] - a[1]).map(([u, n]) => (
                  <tr key={u}><td>{u}</td><td className="num">{f0(n)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-h"><div><h2>Solicitudes de cambio de equipo</h2><p>Al aprobar, el agente pasa al equipo del director que lo pidió</p></div></div>
        {solicitudes.length === 0 ? (
          <p className="card" style={{ padding: '18px 20px', color: 'var(--ink-2)' }}>
            No hay solicitudes. Cuando un director pida sumar a alguien que no figura en su equipo, el pedido aparece acá.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Agente</th><th>Hoy figura en</th><th>Lo pide</th><th>Motivo</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {solicitudes.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.nombre}</strong><span className="sm">Legajo {s.legajo}</span></td>
                    <td>{unidadActual.get(s.legajo) ?? '—'}</td>
                    <td>{usuarios.get(s.solicitante_id)?.nombre ?? '—'}</td>
                    <td>{s.motivo}<span className="sm">{fecha(s.creada_en)}</span></td>
                    <td>{s.estado === 'pendiente' ? <span className="pill warn">Pendiente</span> : s.estado === 'aprobada' ? <span className="pill ok">Aprobada</span> : <span className="pill bad">Rechazada</span>}</td>
                    <td className="num">
                      {s.estado === 'pendiente' && (
                        <form action={resolverSolicitud} style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <input type="hidden" name="id" value={s.id} />
                          <button className="btn sm primary" name="aprobar" value="1">Aprobar</button>
                          <button className="btn sm" name="aprobar" value="0">Rechazar</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
