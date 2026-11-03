import Link from 'next/link';
import { Filtros } from '@/components/Filtros';
import {
  Barras, Delta, Distribucion, Leyenda, LeyendaCategoriasGrafico, LeyendaRitmo, Ritmo, TablaBarras, TablaDistribucion, TablaRitmo,
  type FilaBarra, type PuntoRitmo,
} from '@/components/Graficos';
import { TarjetaGrafico } from '@/components/TarjetaGrafico';
import { datosPeriodo, evaluadores, resumenPeriodos, ultimosIngresos } from '@/lib/datos-ch';
import { AGRUPAMIENTOS, categoria } from '@/lib/escala';
import { nombreCorto } from '@/lib/competencias';
import { f0, f1, pct, promedio } from '@/lib/formato';
import { diasParaCierre, fecha, periodoActual, periodoAnterior, textoCierre } from '@/lib/periodos';
import { puedeVerRespuestas, requerirCH } from '@/lib/sesion';
import { clienteAdmin } from '@/lib/supabase/admin';
import type { FilaEvaluacion } from '@/lib/tipos';

// Para quien no ve puntajes individuales, los promedios de grupos chicos se ocultan:
// en un grupo de una o dos personas el promedio es, en la práctica, el puntaje de alguien.
const MIN_GRUPO = 5;

// Días en hora de Argentina
const diaDe = (iso: string) => new Date(Date.parse(iso) - 3 * 36e5).toISOString().slice(0, 10);
const sumarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const todoIgual = (e: FilaEvaluacion) => new Set(e.puntajes).size === 1;
const porcentaje = (n: number) => `${Math.round(n)}%`;

export default async function Tablero({ searchParams }: { searchParams: Promise<{ secretaria?: string; agrup?: string }> }) {
  const usuario = await requerirCH();
  const ve = puedeVerRespuestas(usuario);
  const visible = (n: number) => ve || n >= MIN_GRUPO;
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
  const [D, P, resumen, usuarios, ingresos, { count: pedidosPendientes }] = await Promise.all([
    datosPeriodo(periodo.id),
    anterior ? datosPeriodo(anterior.id) : null,
    resumenPeriodos(secretaria),
    evaluadores(),
    ultimosIngresos(),
    db.from('solicitudes').select('id', { count: 'exact', head: true }).eq('periodo_id', periodo.id).eq('estado', 'pendiente'),
  ]);
  const etqA = periodo.nombre, etqP = anterior?.nombre ?? null;
  const abierto = periodo.estado === 'abierto';

  // Selección
  const padron = D.padron.filter((a) => !secretaria || a.secretaria === secretaria);
  const enSeleccion = new Set(padron.map((a) => a.legajo));
  const enviadas = (lista: FilaEvaluacion[], legajos: Set<string>) =>
    lista.filter((e) => e.estado === 'enviada' && legajos.has(e.legajo) && (!agrup || e.agrupamiento === agrup));
  const now = enviadas(D.evaluaciones, enSeleccion);
  const prevLegajos = new Set((P?.padron ?? []).filter((a) => !secretaria || a.secretaria === secretaria).map((a) => a.legajo));
  const prev = P ? enviadas(P.evaluaciones, prevLegajos) : [];
  const resultados = visible(now.length);

  const enviadasSel = D.evaluaciones.filter((e) => e.estado === 'enviada' && enSeleccion.has(e.legajo));
  const estadoDe = new Map(D.evaluaciones.map((e) => [e.legajo, e.estado]));
  const avance = padron.length ? enviadasSel.length / padron.length : 0;
  const sinEvaluador = padron.filter((a) => !a.evaluador_id).length;

  // Avance de cada evaluador en la selección
  const porEvaluador = new Map<string, { total: number; env: number; bor: number }>();
  for (const a of padron) {
    if (!a.evaluador_id) continue;
    const g = porEvaluador.get(a.evaluador_id) ?? { total: 0, env: 0, bor: 0 };
    g.total++;
    const e = estadoDe.get(a.legajo);
    if (e === 'enviada') g.env++; else if (e === 'borrador') g.bor++;
    porEvaluador.set(a.evaluador_id, g);
  }
  const evals = [...porEvaluador.entries()];
  const conPendientes = evals.filter(([, g]) => g.env < g.total).length;
  const entraron = evals.filter(([id]) => { const u = usuarios.get(id); return !!u && ingresos.has(u.email.toLowerCase()); }).length;
  const empezaron = evals.filter(([, g]) => g.env + g.bor > 0).length;
  const terminaron = evals.length - conPendientes;
  const maxEmbudo = Math.max(evals.length, 1);
  const embudo: FilaBarra[] = [
    { label: 'Tienen personas a cargo', now: evals.length, prev: null },
    { label: 'Entraron al sistema', now: entraron, prev: null },
    { label: 'Empezaron a evaluar', now: empezaron, prev: null },
    { label: 'Terminaron', now: terminaron, prev: null },
  ];

  // Ritmo de carga: envíos acumulados por día, del inicio a hoy
  const hoy = diaDe(new Date().toISOString());
  const diasPeriodo = diasEntre(periodo.inicio, periodo.cierre) + 1;
  const hasta = hoy < periodo.cierre ? hoy : periodo.cierre;
  const porDia = new Map<string, number>();
  for (const e of enviadasSel) {
    const d = e.enviada_en ? diaDe(e.enviada_en) : periodo.inicio;
    const k = d < periodo.inicio ? periodo.inicio : d;
    porDia.set(k, (porDia.get(k) ?? 0) + 1);
  }
  const puntos: PuntoRitmo[] = [];
  for (let i = 0, acum = 0; i <= diasEntre(periodo.inicio, hasta); i++) {
    const d = sumarDias(periodo.inicio, i);
    acum += porDia.get(d) ?? 0;
    puntos.push({ fecha: fecha(d).slice(0, 5), acumuladas: acum });
  }
  const restantes = diasPeriodo - puntos.length;
  const porDiaActual = puntos.length ? enviadasSel.length / puntos.length : 0;
  const proyeccion = enviadasSel.length ? Math.min(padron.length, enviadasSel.length + porDiaActual * restantes) : null;
  const necesarioPorDia = restantes > 0 ? Math.ceil((padron.length - enviadasSel.length) / restantes) : 0;

  // Para atender
  const restan = diasParaCierre(periodo);
  const sinEmpezar = evals.length - empezaron;
  const nuncaEntraron = evals.length - entraron;
  const alertas: { nivel: 'bad' | 'warn'; texto: string; href: string; accion: string }[] = [];
  if (abierto && sinEmpezar) {
    alertas.push({ nivel: restan <= 7 ? 'bad' : 'warn', texto: `${f0(sinEmpezar)} ${sinEmpezar === 1 ? 'evaluador no empezó' : 'evaluadores no empezaron'} y el período ${textoCierre(periodo)}`, href: '/ch/seguimiento', accion: 'Ver quiénes' });
  }
  if (abierto && nuncaEntraron) {
    alertas.push({ nivel: 'warn', texto: `${f0(nuncaEntraron)} ${nuncaEntraron === 1 ? 'evaluador nunca entró' : 'evaluadores nunca entraron'} al sistema`, href: '/ch/seguimiento', accion: 'Copiar mails' });
  }
  if (sinEvaluador) {
    alertas.push({ nivel: 'warn', texto: `${f0(sinEvaluador)} agentes no tienen evaluador asignado`, href: '/ch/configuracion', accion: 'Cargar evaluadores' });
  }
  if (pedidosPendientes) {
    alertas.push({ nivel: 'warn', texto: `${pedidosPendientes} ${pedidosPendientes === 1 ? 'pedido' : 'pedidos'} de cambio de equipo esperan respuesta`, href: '/ch/seguimiento', accion: 'Responder' });
  }

  // Resultados
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
  // El formulario anterior no pedía agrupamiento: en los históricos no hay con qué comparar
  const etqPAgrup = prev.some((e) => e.agrupamiento) ? etqP : null;
  const porAgrup: FilaBarra[] = AGRUPAMIENTOS.map((g) => {
    const n = now.filter((e) => e.agrupamiento === g.id), p = prev.filter((e) => e.agrupamiento === g.id);
    return { label: g.nombre, now: visible(n.length) ? promedio(tot(n)) : null, prev: etqPAgrup ? promedio(tot(p)) : null, nNow: n.length };
  }).filter((r) => r.now != null || r.prev != null);

  // Evolución: semestres anteriores (resumen de la base) y el período actual
  const evolucion = [
    ...resumen.filter((r) => r.periodo_id !== periodo.id).map((r) => ({
      nombre: r.nombre, n: r.evaluadas, prom: r.promedio, igual: r.todo_igual,
      conteos: [r.basico, r.intermedio, r.avanzado, r.experto, r.lider],
    })),
    { nombre: etqA, n: now.length, prom: prom ?? 0, igual: now.filter(todoIgual).length, conteos: dist(now) },
  ].filter((s) => s.n === 0 || visible(s.n));
  const series = evolucion.map((s) => ({ nombre: s.nombre, conteos: s.conteos }));
  const promedios: FilaBarra[] = evolucion.map((s) => ({ label: s.nombre, now: s.n ? s.prom : null, prev: null, nNow: s.n }));
  const iguales: FilaBarra[] = evolucion.map((s) => ({ label: s.nombre, now: s.n ? (s.igual / s.n) * 100 : null, prev: null, nNow: s.n }));

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

  // Calidad de las respuestas por evaluador (solo quien ve puntajes)
  const calidad = ve
    ? [...Map.groupBy(now, (e) => e.evaluador_id ?? '').entries()]
      .filter(([id, l]) => id && l.length >= 3)
      .map(([id, l]) => {
        const p = promedio(tot(l))!;
        return { id, nombre: usuarios.get(id)?.nombre ?? 'Usuario dado de baja', n: l.length, prom: p, dif: prom == null ? 0 : p - prom, igual: l.filter(todoIgual).length / l.length };
      })
      .sort((a, b) => b.igual - a.igual || Math.abs(b.dif) - Math.abs(a.dif))
    : [];

  const secretarias = [...new Set(D.padron.map((a) => a.secretaria).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, 'es'));
  const descarga = (tipo: string) => `/ch/exportar?${new URLSearchParams({ tipo, ...(secretaria && { secretaria }) })}`;
  const oculto = <p className="chart-empty">Se muestra cuando hay {MIN_GRUPO} o más evaluaciones enviadas en la selección.</p>;

  return (
    <>
      <Filtros
        campos={[
          { nombre: 'secretaria', etiqueta: 'Secretaría', todas: 'Todas las secretarías', opciones: secretarias.map((s) => ({ valor: s, texto: s })) },
          { nombre: 'agrup', etiqueta: 'Agrupamiento', todas: 'Todos los agrupamientos', opciones: AGRUPAMIENTOS.map((g) => ({ valor: g.id, texto: g.nombre })) },
        ]}
        resumen={`${f0(padron.length)} agentes en la selección`}
      />
      <div className="banner-fila">
        <p className="banner">
          {abierto ? `Resultados parciales: ${f0(enviadasSel.length)} de ${f0(padron.length)} evaluaciones enviadas.` : 'El período todavía no está abierto.'}
          {etqP ? ` La comparación usa ${etqP}.` : ' Cuando se carguen los resultados de años anteriores, vas a ver la comparación acá.'}
          {agrup && ' El filtro de agrupamiento se aplica a los resultados del período actual, no al avance ni a los semestres anteriores.'}
        </p>
        <div className="descargas">
          <a className="btn sm" href={descarga('avance')}>Descargar avance</a>
          {ve && <a className="btn sm" href={descarga('resultados')}>Descargar resultados</a>}
        </div>
      </div>

      <div className="kpis">
        <div className="card kpi">
          <p className="kpi-label">Avance de la carga</p>
          <p className="kpi-val">{pct(avance)}</p>
          <div className="meter"><span style={{ width: `${avance * 100}%` }} /></div>
          <p className="kpi-sub">{f0(enviadasSel.length)} de {f0(padron.length)} evaluaciones enviadas</p>
        </div>
        <div className="card kpi">
          <p className="kpi-label">Puntaje promedio</p>
          <p className="kpi-val">{prom == null || !resultados ? '—' : <>{f1(prom)}<small>/100</small></>}</p>
          {etqP && resultados && <Delta actual={prom} anterior={promPrev} formato={f1} unidad=" pts" etiqueta={etqP} />}
          {!resultados && <p className="kpi-sub">Se muestra con {MIN_GRUPO} o más evaluaciones</p>}
        </div>
        <div className="card kpi">
          <p className="kpi-label">Experto o Líder (80 o más)</p>
          <p className="kpi-val">{altos == null || !resultados ? '—' : pct(altos)}</p>
          {etqP && resultados && <Delta actual={altos == null ? null : altos * 100} anterior={altosPrev == null ? null : altosPrev * 100} formato={f0} unidad=" p.p." etiqueta={etqP} />}
        </div>
        <div className="card kpi">
          <p className="kpi-label">Evaluadores con pendientes</p>
          <p className="kpi-val">{conPendientes}<small>de {evals.length}</small></p>
          <p className="kpi-sub">{abierto ? `El período ${textoCierre(periodo)}` : ''}</p>
        </div>
      </div>

      <div className="grid2">
        {abierto && puntos.length > 0 && (
          <TarjetaGrafico className="span2" titulo="Ritmo de carga"
            subtitulo={`${f0(enviadasSel.length)} de ${f0(padron.length)} enviadas.${proyeccion != null && restantes > 0
              ? ` A este ritmo (${f1(porDiaActual)} por día) se llega al ${pct(padron.length ? proyeccion / padron.length : 0)} al cierre; para terminar hacen falta ${f0(necesarioPorDia)} por día.`
              : ''}`}
            leyenda={<LeyendaRitmo />} tabla={<TablaRitmo puntos={puntos} dias={diasPeriodo} total={padron.length} />}>
            <Ritmo puntos={puntos} dias={diasPeriodo} total={padron.length} proyeccion={proyeccion} />
          </TarjetaGrafico>
        )}
        <TarjetaGrafico titulo="Evaluadores" subtitulo="Cuántos llegaron a cada paso"
          tabla={<TablaBarras filas={embudo} columna="Paso" formato={f0} actual="Evaluadores" />}>
          {evals.length
            ? <Barras filas={embudo} max={maxEmbudo} marcas={[...new Set([0, Math.round(maxEmbudo / 2), maxEmbudo])]} formato={f0} actual="Evaluadores" />
            : <p className="chart-empty">Todavía no hay evaluadores asignados en esta selección.</p>}
        </TarjetaGrafico>
        <section className="card chart">
          <div className="chart-h"><div><h2>Para atender</h2><p>Lo que conviene resolver para que el período termine a tiempo</p></div></div>
          {alertas.length ? (
            <ul className="alertas">
              {alertas.map((a) => (
                <li key={a.texto}>
                  <span className={`pill ${a.nivel}`}>{a.nivel === 'bad' ? 'Urgente' : 'Atención'}</span>
                  <span>{a.texto}</span>
                  <Link href={a.href}>{a.accion}</Link>
                </li>
              ))}
            </ul>
          ) : <p className="chart-empty">No hay nada pendiente.</p>}
        </section>

        <TarjetaGrafico className="span2" titulo="Distribución por categoría"
          subtitulo={`Porcentaje de agentes evaluados en cada categoría, por semestre${ve ? '' : `. Los semestres con menos de ${MIN_GRUPO} evaluaciones no se muestran`}`}
          leyenda={<LeyendaCategoriasGrafico />} tabla={<TablaDistribucion series={series} />}>
          <Distribucion series={series} />
        </TarjetaGrafico>
        <TarjetaGrafico titulo="Promedio por semestre" subtitulo="Puntaje final sobre 100"
          tabla={<TablaBarras filas={promedios} columna="Semestre" formato={f1} actual="Promedio" />}>
          <Barras filas={promedios} max={100} marcas={[0, 20, 40, 60, 80, 100]} formato={f1} actual="Promedio" />
        </TarjetaGrafico>
        <TarjetaGrafico titulo="Mismo puntaje en todo" subtitulo="Evaluaciones con el mismo número en las 10 competencias"
          tabla={<TablaBarras filas={iguales} columna="Semestre" formato={porcentaje} actual="Evaluaciones" />}>
          <Barras filas={iguales} max={100} marcas={[0, 25, 50, 75, 100]} formato={porcentaje} actual="Evaluaciones" />
        </TarjetaGrafico>

        <TarjetaGrafico titulo="Promedio por competencia" subtitulo="Escala de 1 a 10" leyenda={<Leyenda actual={etqA} anterior={etqP} />}
          tabla={<TablaBarras filas={comp} columna="Competencia" formato={f1} actual={etqA} anterior={etqP} />}>
          {!resultados ? oculto : now.length || prev.length
            ? <Barras filas={comp} max={10} marcas={[0, 2, 4, 6, 8, 10]} formato={f1} actual={etqA} anterior={etqP} />
            : <p className="chart-empty">Todavía no hay evaluaciones enviadas en esta selección.</p>}
        </TarjetaGrafico>
        <TarjetaGrafico titulo="Promedio por agrupamiento" subtitulo={`Puntaje final sobre 100${etqP && !etqPAgrup ? `. ${etqP} no registraba agrupamiento` : ''}`}
          leyenda={<Leyenda actual={etqA} anterior={etqPAgrup} />}
          tabla={<TablaBarras filas={porAgrup} columna="Agrupamiento" formato={f1} actual={etqA} anterior={etqPAgrup} />}>
          {porAgrup.length
            ? <Barras filas={porAgrup} max={100} marcas={[0, 20, 40, 60, 80, 100]} formato={f1} actual={etqA} anterior={etqPAgrup} />
            : resultados ? <p className="chart-empty">Todavía no hay evaluaciones enviadas en esta selección.</p> : oculto}
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
                  const p = g.env / g.total;
                  const pr = visible(g.tot.length) ? promedio(g.tot) : null, pp = visible(g.totPrev.length) ? promedio(g.totPrev) : null;
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
          {!ve && <p className="kpi-sub">Los promedios de grupos con menos de {MIN_GRUPO} evaluaciones no se muestran.</p>}
        </section>

        {ve && (
          <section className="card chart span2">
            <div className="chart-h">
              <div>
                <h2>Calidad de las respuestas por evaluador</h2>
                <p>Evaluadores con 3 o más evaluaciones enviadas. Primero quienes pusieron el mismo puntaje en todo; la diferencia es contra el promedio de la selección.</p>
              </div>
            </div>
            {calidad.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Evaluador/a</th><th className="num">Enviadas</th><th className="num">Promedio</th><th className="num">Diferencia</th><th className="num">Mismo puntaje en todo</th></tr></thead>
                  <tbody>
                    {calidad.slice(0, 20).map((c) => (
                      <tr key={c.id}>
                        <td><strong>{c.nombre}</strong></td>
                        <td className="num">{c.n}</td>
                        <td className="num">{f1(c.prom)}</td>
                        <td className="num">{Math.abs(c.dif) < 0.05 ? '=' : `${c.dif > 0 ? '+' : '−'}${f1(Math.abs(c.dif))}`}</td>
                        <td className="num">{pct(c.igual)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="chart-empty">Todavía no hay evaluadores con 3 o más evaluaciones enviadas en esta selección.</p>}
          </section>
        )}
      </div>
    </>
  );
}
