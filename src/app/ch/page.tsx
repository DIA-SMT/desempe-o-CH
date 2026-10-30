import Link from 'next/link';
import { Filtros } from '@/components/Filtros';
import { Barras, Delta, Distribucion, Leyenda, LeyendaCategoriasGrafico, TablaBarras, TablaDistribucion, type FilaBarra } from '@/components/Graficos';
import { TarjetaGrafico } from '@/components/TarjetaGrafico';
import { datosPeriodo } from '@/lib/datos-ch';
import { AGRUPAMIENTOS, categoria } from '@/lib/escala';
import { nombreCorto } from '@/lib/competencias';
import { f0, f1, pct, promedio } from '@/lib/formato';
import { periodoActual, periodoAnterior, textoCierre } from '@/lib/periodos';
import { requerirCH } from '@/lib/sesion';
import { clienteAdmin } from '@/lib/supabase/admin';
import type { FilaEvaluacion } from '@/lib/tipos';

export default async function Tablero({ searchParams }: { searchParams: Promise<{ secretaria?: string; agrup?: string }> }) {
  await requerirCH();
  const { secretaria = '', agrup = '' } = await searchParams;
  const db = clienteAdmin();
  const periodo = await periodoActual(db);
  if (!periodo) {
    return (
      <section className="card vacio">
        <h2>Todavía no hay un período de evaluación</h2>
        <p className="sub">Creá el período, cargá los evaluadores y abrilo desde <Link href="/ch/configuracion">Configuración</Link>.</p>
      </section>
    );
  }

  const anterior = await periodoAnterior(db, periodo);
  const [D, P] = await Promise.all([datosPeriodo(periodo.id), anterior ? datosPeriodo(anterior.id) : null]);
  const etqA = periodo.nombre, etqP = anterior?.nombre ?? null;

  // Selección
  const padron = D.padron.filter((a) => !secretaria || a.secretaria === secretaria);
  const enSeleccion = new Set(padron.map((a) => a.legajo));
  const enviadas = (lista: FilaEvaluacion[], legajos: Set<string>) =>
    lista.filter((e) => e.estado === 'enviada' && legajos.has(e.legajo) && (!agrup || e.agrupamiento === agrup));
  const now = enviadas(D.evaluaciones, enSeleccion);
  const prevLegajos = new Set((P?.padron ?? []).filter((a) => !secretaria || a.secretaria === secretaria).map((a) => a.legajo));
  const prev = P ? enviadas(P.evaluaciones, prevLegajos) : [];

  const enviadasSel = D.evaluaciones.filter((e) => e.estado === 'enviada' && enSeleccion.has(e.legajo));
  const estadoDe = new Map(D.evaluaciones.map((e) => [e.legajo, e.estado]));
  const avance = padron.length ? enviadasSel.length / padron.length : 0;
  const sinEvaluador = padron.filter((a) => !a.evaluador_id).length;
  const conPendientes = new Set(padron.filter((a) => a.evaluador_id && estadoDe.get(a.legajo) !== 'enviada').map((a) => a.evaluador_id));
  const todosEvaluadores = new Set(padron.map((a) => a.evaluador_id).filter(Boolean));

  const tot = (l: FilaEvaluacion[]) => l.map((e) => e.total);
  const prom = promedio(tot(now)), promPrev = promedio(tot(prev));
  const altos = now.length ? now.filter((e) => e.total >= 80).length / now.length : null;
  const altosPrev = prev.length ? prev.filter((e) => e.total >= 80).length / prev.length : null;
  const dist = (l: FilaEvaluacion[]) => { const c = [0, 0, 0, 0, 0]; l.forEach((e) => c[categoria(e.total).id - 1]++); return c; };

  // Por competencia: se compara por nombre, por si cambió el orden entre períodos
  const idxPrev = new Map((P?.competencias ?? []).map((c, i) => [c.nombre, i]));
  const comp: FilaBarra[] = D.competencias.map((c, i) => {
    const j = idxPrev.get(c.nombre);
    return {
      label: nombreCorto(c.nombre),
      now: promedio(now.map((e) => e.puntajes[i]).filter((v): v is number => v != null)),
      prev: j == null ? null : promedio(prev.map((e) => e.puntajes[j]).filter((v): v is number => v != null)),
      nNow: now.length,
    };
  });
  const porAgrup: FilaBarra[] = AGRUPAMIENTOS.map((g) => {
    const n = now.filter((e) => e.agrupamiento === g.id), p = prev.filter((e) => e.agrupamiento === g.id);
    return { label: g.nombre, now: promedio(tot(n)), prev: promedio(tot(p)), nNow: n.length };
  }).filter((r) => r.now != null || r.prev != null);

  // Avance por secretaría (o por unidad dentro de la secretaría elegida)
  const clave = (a: { secretaria: string | null; unidad_nombre: string }) => (secretaria ? a.unidad_nombre : a.secretaria ?? 'Sin secretaría');
  const grupos = new Map<string, { total: number; env: number; bor: number; sinEv: number; tot: number[]; totPrev: number[] }>();
  for (const a of padron) {
    const g = grupos.get(clave(a)) ?? { total: 0, env: 0, bor: 0, sinEv: 0, tot: [], totPrev: [] };
    g.total++;
    if (!a.evaluador_id) g.sinEv++;
    const e = estadoDe.get(a.legajo);
    if (e === 'enviada') g.env++; else if (e === 'borrador') g.bor++;
    grupos.set(clave(a), g);
  }
  const unidadDe = new Map(D.padron.map((a) => [a.legajo, a]));
  now.forEach((e) => { const a = unidadDe.get(e.legajo); if (a) grupos.get(clave(a))?.tot.push(e.total); });
  const unidadPrev = new Map((P?.padron ?? []).map((a) => [a.legajo, a]));
  prev.forEach((e) => { const a = unidadPrev.get(e.legajo); if (a) grupos.get(clave(a))?.totPrev.push(e.total); });
  const filasGrupo = [...grupos.entries()].sort((a, b) => a[1].env / a[1].total - b[1].env / b[1].total);

  const secretarias = [...new Set(D.padron.map((a) => a.secretaria).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, 'es'));
  const series = [{ nombre: etqA, conteos: dist(now) }, ...(P ? [{ nombre: etqP!, conteos: dist(prev) }] : [])];

  return (
    <>
      <Filtros
        campos={[
          { nombre: 'secretaria', etiqueta: 'Secretaría', todas: 'Todas las secretarías', opciones: secretarias.map((s) => ({ valor: s, texto: s })) },
          { nombre: 'agrup', etiqueta: 'Agrupamiento', todas: 'Todos los agrupamientos', opciones: AGRUPAMIENTOS.map((g) => ({ valor: g.id, texto: g.nombre })) },
        ]}
        resumen={`${f0(padron.length)} agentes en la selección`}
      />
      <p className="banner">
        {periodo.estado === 'abierto' ? `Resultados parciales: ${f0(enviadasSel.length)} de ${f0(padron.length)} evaluaciones enviadas.` : 'El período todavía no está abierto.'}
        {etqP ? ` La comparación usa el ${etqP}.` : ' Cuando se carguen los resultados de años anteriores, vas a ver la comparación acá.'}
        {agrup && ' El filtro de agrupamiento se aplica a los resultados, no al avance.'}
      </p>

      <div className="kpis">
        <div className="card kpi">
          <p className="kpi-label">Avance de la carga</p>
          <p className="kpi-val">{pct(avance)}</p>
          <div className="meter"><span style={{ width: `${avance * 100}%` }} /></div>
          <p className="kpi-sub">{f0(enviadasSel.length)} de {f0(padron.length)} evaluaciones enviadas</p>
        </div>
        <div className="card kpi">
          <p className="kpi-label">Puntaje promedio</p>
          <p className="kpi-val">{prom == null ? '—' : <>{f1(prom)}<small>/100</small></>}</p>
          {etqP && <Delta actual={prom} anterior={promPrev} formato={f1} unidad=" pts" etiqueta={etqP} />}
        </div>
        <div className="card kpi">
          <p className="kpi-label">Experto o Líder (80 o más)</p>
          <p className="kpi-val">{altos == null ? '—' : pct(altos)}</p>
          {etqP && <Delta actual={altos == null ? null : altos * 100} anterior={altosPrev == null ? null : altosPrev * 100} formato={f0} unidad=" p.p." etiqueta={etqP} />}
        </div>
        <div className="card kpi">
          <p className="kpi-label">Evaluadores con pendientes</p>
          <p className="kpi-val">{conPendientes.size}<small>de {todosEvaluadores.size}</small></p>
          <p className="kpi-sub">
            {sinEvaluador ? <><Link href="/ch/seguimiento">{f0(sinEvaluador)} agentes sin evaluador</Link> · </> : null}
            {periodo.estado === 'abierto' ? `El período ${textoCierre(periodo)}` : ''}
          </p>
        </div>
      </div>

      <div className="grid2">
        <TarjetaGrafico className="span2" titulo="Distribución por categoría" subtitulo="Porcentaje de agentes evaluados en cada categoría"
          leyenda={<LeyendaCategoriasGrafico />} tabla={<TablaDistribucion series={series} />}>
          <Distribucion series={series} />
        </TarjetaGrafico>
        <TarjetaGrafico titulo="Promedio por competencia" subtitulo="Escala de 1 a 10" leyenda={<Leyenda actual={etqA} anterior={etqP} />}
          tabla={<TablaBarras filas={comp} columna="Competencia" formato={f1} actual={etqA} anterior={etqP} />}>
          {now.length || prev.length
            ? <Barras filas={comp} max={10} marcas={[0, 2, 4, 6, 8, 10]} formato={f1} actual={etqA} anterior={etqP} />
            : <p className="chart-empty">Todavía no hay evaluaciones enviadas en esta selección.</p>}
        </TarjetaGrafico>
        <TarjetaGrafico titulo="Promedio por agrupamiento" subtitulo="Puntaje final sobre 100" leyenda={<Leyenda actual={etqA} anterior={etqP} />}
          tabla={<TablaBarras filas={porAgrup} columna="Agrupamiento" formato={f1} actual={etqA} anterior={etqP} />}>
          {porAgrup.length
            ? <Barras filas={porAgrup} max={100} marcas={[0, 20, 40, 60, 80, 100]} formato={f1} actual={etqA} anterior={etqP} />
            : <p className="chart-empty">Todavía no hay evaluaciones enviadas en esta selección.</p>}
        </TarjetaGrafico>

        <section className="card chart span2">
          <div className="chart-h">
            <div>
              <h2>Avance y resultados por {secretaria ? 'unidad' : 'secretaría'}</h2>
              <p>Ordenado por avance, de menor a mayor{secretaria ? '' : '. Elegí una secretaría para ver sus direcciones.'}</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{secretaria ? 'Unidad' : 'Secretaría'}</th><th>Avance</th><th className="num">Borradores</th>
                  <th className="num">Sin evaluador</th><th className="num">Promedio</th>{etqP && <th className="num">vs {etqP}</th>}
                </tr>
              </thead>
              <tbody>
                {filasGrupo.map(([nombre, g]) => {
                  const p = g.env / g.total, pr = promedio(g.tot), pp = promedio(g.totPrev);
                  const dif = pr != null && pp != null ? pr - pp : null;
                  return (
                    <tr key={nombre}>
                      <td><strong>{nombre}</strong></td>
                      <td>
                        <div className="cellmeter">
                          <div className="meter"><span style={{ width: `${p * 100}%` }} /></div>
                          <span className="num">{f0(g.env)}/{f0(g.total)}</span>
                          {p === 1 ? <span className="pill ok">Completa</span> : g.env === 0 ? <span className="pill bad">Sin empezar</span> : null}
                        </div>
                      </td>
                      <td className="num">{g.bor || '—'}</td>
                      <td className="num">{g.sinEv || '—'}</td>
                      <td className="num">{pr == null ? '—' : f1(pr)}</td>
                      {etqP && (
                        <td className="num">
                          {dif == null ? '—' : <span className={`delta ${dif >= 0 ? 'up' : 'down'}`}>{dif >= 0 ? '▲ +' : '▼ −'}{f1(Math.abs(dif))}</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
