// Gráficos del tablero (componentes de servidor). Los tooltips los muestra <Tooltips />.
import { CATEGORIAS } from '@/lib/escala';
import { f0, pct } from '@/lib/formato';
import { tip } from '@/lib/tip';

export interface FilaBarra { label: string; now: number | null; prev: number | null; nNow?: number }

export function Leyenda({ actual, anterior }: { actual: string; anterior?: string | null }) {
  return (
    <div className="legend">
      <span className="lg k-now"><i />{actual}</span>
      {anterior && <span className="lg k-prev"><i className="dot" />{anterior}</span>}
    </div>
  );
}

export function LeyendaCategoriasGrafico() {
  return (
    <div className="legend">
      {CATEGORIAS.map((c) => <span key={c.id} className={`lg cat-${c.id}`}><i />{c.nombre}</span>)}
    </div>
  );
}

// Barras horizontales con el valor del período actual y un punto para el anterior
export function Barras({ filas, max, marcas, formato, actual, anterior }: {
  filas: FilaBarra[];
  max: number;
  marcas: number[];
  formato: (n: number) => string;
  actual: string;
  anterior?: string | null;
}) {
  const lineas = marcas.map((t) => (
    <span key={t} className={`gl${t === 0 ? ' base' : ''}`} style={{ left: `${(t / max) * 100}%` }} />
  ));
  return (
    <div className="bars">
      {filas.map((r) => (
        <div key={r.label} className="bar-row" tabIndex={0} {...tip({
          title: r.label,
          rows: [
            { k: 'k-now', v: r.now == null ? 'Sin datos' : formato(r.now), l: actual + (r.nNow != null ? ` · ${r.nNow} eval.` : '') },
            ...(anterior ? [{ k: 'k-prev', v: r.prev == null ? 'Sin datos' : formato(r.prev), l: anterior }] : []),
          ],
        })}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            {lineas}
            {r.now != null && <span className="bar-fill" style={{ width: `${(r.now / max) * 100}%` }} />}
            {anterior && r.prev != null && <span className="bar-prev" style={{ left: `${(r.prev / max) * 100}%` }} />}
          </span>
          <span className="bar-val">{r.now == null ? '—' : formato(r.now)}</span>
        </div>
      ))}
      <div className="bar-axis" aria-hidden="true">
        <span />
        <span className="axis-track">
          {marcas.map((t) => <span key={t} style={{ left: `${(t / max) * 100}%` }}>{t}</span>)}
        </span>
        <span />
      </div>
    </div>
  );
}

export function TablaBarras({ filas, columna, formato, actual, anterior }: {
  filas: FilaBarra[]; columna: string; formato: (n: number) => string; actual: string; anterior?: string | null;
}) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>{columna}</th><th className="num">{actual}</th>
            {anterior && <><th className="num">{anterior}</th><th className="num">Diferencia</th></>}
          </tr>
        </thead>
        <tbody>
          {filas.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className="num">{r.now == null ? '—' : formato(r.now)}</td>
              {anterior && (
                <>
                  <td className="num">{r.prev == null ? '—' : formato(r.prev)}</td>
                  <td className="num">{r.now == null || r.prev == null ? '—' : `${r.now - r.prev >= 0 ? '+' : '−'}${formato(Math.abs(r.now - r.prev))}`}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Barras apiladas al 100% con la distribución por categoría
export function Distribucion({ series }: { series: { nombre: string; conteos: number[] }[] }) {
  return (
    <div className="stacks">
      {series.map(({ nombre, conteos }) => {
        const n = conteos.reduce((s, x) => s + x, 0);
        return (
          <div key={nombre} className="stack-row">
            <span className="stack-label">{nombre}<small>{n ? `${n} evaluados` : 'Sin evaluaciones'}</small></span>
            {n ? (
              <span className="stack">
                {conteos.map((k, i) => k ? (
                  <span key={i} className={`seg cat-${i + 1}`} tabIndex={0} style={{ flex: `${k} 1 0` }} {...tip({
                    title: `${CATEGORIAS[i].nombre} (${CATEGORIAS[i].rango} puntos)`,
                    rows: [{ k: `cat-${i + 1}`, v: `${k} ${k === 1 ? 'agente' : 'agentes'}`, l: `${pct(k / n)} de ${nombre}` }],
                  })}>
                    {k / n >= 0.1 ? pct(k / n) : ''}
                  </span>
                ) : null)}
              </span>
            ) : (
              <span className="stack none">Todavía no hay datos</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TablaDistribucion({ series }: { series: { nombre: string; conteos: number[] }[] }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr><th>Categoría</th>{series.map((s) => <th key={s.nombre} className="num" colSpan={2}>{s.nombre}</th>)}</tr>
        </thead>
        <tbody>
          {CATEGORIAS.map((c, i) => (
            <tr key={c.id}>
              <td>{c.nombre} <span className="muted">({c.rango})</span></td>
              {series.map((s) => {
                const n = s.conteos.reduce((a, b) => a + b, 0);
                return [
                  <td key={s.nombre + 'n'} className="num">{s.conteos[i]}</td>,
                  <td key={s.nombre + 'p'} className="num">{n ? pct(s.conteos[i] / n) : '—'}</td>,
                ];
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Envíos acumulados por día contra el ritmo necesario para terminar al cierre,
// con la proyección al ritmo actual. Las líneas se dibujan en SVG y el texto en HTML.
export interface PuntoRitmo { fecha: string; acumuladas: number }

export function Ritmo({ puntos, dias, total, proyeccion }: {
  puntos: PuntoRitmo[]; // desde el inicio hasta hoy (o el cierre)
  dias: number;         // días del período, contando el primero y el último
  total: number;        // evaluaciones a completar
  proyeccion: number | null;
}) {
  const x = (i: number) => (dias > 1 ? (i / (dias - 1)) * 100 : 0);
  const y = (n: number) => 100 - (total ? (n / total) * 100 : 0);
  const necesario = (i: number) => Math.round(total * (dias > 1 ? i / (dias - 1) : 1));
  const ultimo = puntos.length - 1;
  const fin = puntos[ultimo];
  return (
    <div className="ritmo">
      <div className="ritmo-y" aria-hidden="true"><span>{f0(total)}</span><span>{f0(total / 2)}</span><span>0</span></div>
      <div className="ritmo-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[0, 50].map((g) => <line key={g} className="r-grid" x1="0" x2="100" y1={g} y2={g} vectorEffect="non-scaling-stroke" />)}
          <line className="r-base" x1="0" x2="100" y1="100" y2="100" vectorEffect="non-scaling-stroke" />
          <line className="r-meta" x1="0" y1="100" x2="100" y2="0" vectorEffect="non-scaling-stroke" />
          {fin && proyeccion != null && ultimo < dias - 1 && (
            <line className="r-proy" x1={x(ultimo)} y1={y(fin.acumuladas)} x2="100" y2={y(proyeccion)} vectorEffect="non-scaling-stroke" />
          )}
          {puntos.length > 1 && (
            <polyline className="r-real" points={puntos.map((p, i) => `${x(i)},${y(p.acumuladas)}`).join(' ')} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {fin && <span className="r-dot" style={{ left: `${x(ultimo)}%`, top: `${y(fin.acumuladas)}%` }} />}
        {puntos.map((p, i) => (
          <span key={p.fecha} className="r-hit" tabIndex={0} style={{ left: `${x(i)}%`, width: `${Math.max(100 / dias, 2)}%` }} {...tip({
            title: p.fecha,
            rows: [
              { k: 'k-now', v: f0(p.acumuladas), l: 'enviadas hasta ese día' },
              { k: 'k-prev', v: f0(necesario(i)), l: 'ritmo necesario' },
            ],
          })} />
        ))}
      </div>
      <div className="ritmo-x" aria-hidden="true">
        <span style={{ left: 0 }}>{puntos[0]?.fecha}</span>
        {ultimo > 0 && ultimo < dias - 1 && <span className="hoy" style={{ left: `${x(ultimo)}%` }}>Hoy</span>}
        <span style={{ right: 0 }}>Cierre</span>
      </div>
    </div>
  );
}

export function TablaRitmo({ puntos, dias, total }: { puntos: PuntoRitmo[]; dias: number; total: number }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr><th>Día</th><th className="num">Enviadas hasta ese día</th><th className="num">Ritmo necesario</th></tr></thead>
        <tbody>
          {puntos.map((p, i) => (
            <tr key={p.fecha}>
              <td>{p.fecha}</td>
              <td className="num">{f0(p.acumuladas)}</td>
              <td className="num">{f0(total * (dias > 1 ? i / (dias - 1) : 1))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LeyendaRitmo() {
  return (
    <div className="legend">
      <span className="lg k-now"><i className="line" />Enviadas</span>
      <span className="lg k-prev"><i className="line" />Ritmo necesario para terminar a tiempo</span>
      <span className="lg k-now"><i className="dash" />Proyección al ritmo actual</span>
    </div>
  );
}

export function Delta({ actual, anterior, formato, unidad, etiqueta }: {
  actual: number | null; anterior: number | null; formato: (n: number) => string; unidad: string; etiqueta: string;
}) {
  if (actual == null || anterior == null) return <p className="delta flat">Sin dato para comparar</p>;
  const d = actual - anterior;
  if (Math.abs(d) < 0.05) return <p className="delta flat">= igual que el {etiqueta}</p>;
  return (
    <p className={`delta ${d > 0 ? 'up' : 'down'}`}>
      {d > 0 ? '▲ +' : '▼ −'}{formato(Math.abs(d))}{unidad} <span>vs {etiqueta}</span>
    </p>
  );
}
