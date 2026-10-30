// Gráficos del tablero (componentes de servidor). Los tooltips los muestra <Tooltips />.
import { CATEGORIAS } from '@/lib/escala';
import { pct } from '@/lib/formato';
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
