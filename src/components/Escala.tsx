import { CATEGORIAS, categoria } from '@/lib/escala';

export function ChipCategoria({ total }: { total: number }) {
  const c = categoria(total);
  return <span className={`chip-cat cat-${c.id}`}>{c.nombre}</span>;
}

// Regla 0-100 con los tramos de cada categoría
export function Regla({ total, sinMarcas }: { total?: number | null; sinMarcas?: boolean }) {
  const tramos: [number, number][] = [[1, 40], [2, 20], [3, 20], [4, 19], [5, 1]];
  return (
    <div className={`ruler${total == null ? ' bare' : ''}`}>
      {total != null && (
        <span className="ruler-pin" style={{ left: `${total}%` }}>
          {total}
        </span>
      )}
      <div className="ruler-track" aria-hidden="true">
        {tramos.map(([c, w]) => (
          <span key={c} className={`cat-${c}`} style={{ flex: `${w} 1 0` }} />
        ))}
      </div>
      {!sinMarcas && (
        <div className="ruler-ticks">
          {[0, 40, 60, 80, 100].map((t) => (
            <span key={t} style={{ left: `${t}%` }}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function LeyendaCategorias() {
  return (
    <div className="ruler-legend">
      {CATEGORIAS.map((c) => (
        <span key={c.id} className={`cat-${c.id}`}>
          <b>{c.nombre}</b> {c.rango}
        </span>
      ))}
    </div>
  );
}
