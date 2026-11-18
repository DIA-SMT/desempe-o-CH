import { f0 } from '@/lib/formato';

// Una persona del área de quien mira, evaluada por otra persona (función avance_area: sin puntajes)
export interface FilaArea {
  legajo: string;
  nombre: string;
  unidad_nombre: string;
  evaluador_id: string | null;
  evaluador: string | null;
  estado: 'enviada' | 'borrador' | 'pendiente';
}

const ESTADO = { borrador: <span className="pill warn">Borrador</span>, pendiente: <span className="pill bad">Pendiente</span> };

// Para secretarios y subsecretarios: cómo van los directores de su área (y su director de despacho)
export function AvanceArea({ filas }: { filas: FilaArea[] }) {
  const grupos = new Map<string, { nombre: string; total: number; env: number; bor: number; unidades: Set<string> }>();
  for (const f of filas) {
    const clave = f.evaluador_id ?? '';
    const g = grupos.get(clave) ?? { nombre: f.evaluador ?? 'Sin evaluador asignado', total: 0, env: 0, bor: 0, unidades: new Set<string>() };
    g.total++;
    g.unidades.add(f.unidad_nombre);
    if (f.estado === 'enviada') g.env++;
    else if (f.estado === 'borrador') g.bor++;
    grupos.set(clave, g);
  }
  const evaluadores = [...grupos.entries()]
    .map(([id, g]) => ({ id, ...g, p: g.env / g.total }))
    .sort((a, b) => a.p - b.p || b.total - a.total);
  const enviadas = filas.filter((f) => f.estado === 'enviada').length;
  const borradores = filas.filter((f) => f.estado === 'borrador').length;
  const faltan = filas.filter((f) => f.estado !== 'enviada');

  return (
    <section className="section" aria-labelledby="avance-area">
      <div className="section-h">
        <div>
          <h2 id="avance-area">Avance de tu área</h2>
          <p>
            La gente de tu área que evalúan otras personas. Ves cómo van las evaluaciones, no los puntajes.
          </p>
        </div>
      </div>
      <div className="progress">
        <div className="meter" role="img" aria-label={`${enviadas} de ${filas.length} enviadas`}>
          <span style={{ width: `${(enviadas / filas.length) * 100}%` }} />
        </div>
        <p>
          <strong>{f0(enviadas)} de {f0(filas.length)}</strong> evaluaciones enviadas
          {borradores ? ` · ${f0(borradores)} en borrador` : ''}
        </p>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Evaluador/a</th><th>Avance</th><th className="num">Borradores</th><th>Estado</th><th>Unidades</th></tr></thead>
          <tbody>
            {evaluadores.map((e) => (
              <tr key={e.id}>
                <td style={{ minWidth: 170 }}><strong>{e.nombre}</strong></td>
                <td><div className="cellmeter"><div className="meter"><span style={{ width: `${e.p * 100}%` }} /></div><span className="num">{e.env}/{e.total}</span></div></td>
                <td className="num">{e.bor || '—'}</td>
                <td>{e.p === 1 ? <span className="pill ok">Completo</span> : e.env === 0 ? <span className="pill bad">Sin empezar</span> : <span className="pill warn">En curso</span>}</td>
                <td><span className="sm" style={{ color: 'var(--ink-2)' }}>{[...e.unidades].join(' · ')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {faltan.length > 0 && (
        <details className="faltan">
          <summary>Ver a quiénes falta evaluar ({f0(faltan.length)})</summary>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Persona</th><th>Unidad</th><th>Evaluador/a</th><th>Estado</th></tr></thead>
              <tbody>
                {faltan.map((f) => (
                  <tr key={f.legajo}>
                    <td style={{ minWidth: 170 }}><strong>{f.nombre}</strong><span className="sm">Legajo {f.legajo}</span></td>
                    <td>{f.unidad_nombre}</td>
                    <td>{f.evaluador ?? 'Sin evaluador asignado'}</td>
                    <td>{ESTADO[f.estado as 'borrador' | 'pendiente']}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
