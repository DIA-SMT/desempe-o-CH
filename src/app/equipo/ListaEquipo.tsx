'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { categoria } from '@/lib/escala';
import { normalizar } from '@/lib/formato';

export interface FilaEquipo {
  legajo: string;
  nombre: string;
  unidad: string;
  estado: 'pendiente' | 'borrador' | 'enviada';
  total: number;
  respondidas: number;
  fecha: string | null;
}

type Filtro = 'todos' | 'pendientes' | 'enviadas';

export function ListaEquipo({ filas, marcado }: { filas: FilaEquipo[]; marcado?: string }) {
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const enviadas = filas.filter((f) => f.estado === 'enviada').length;
  const variasUnidades = new Set(filas.map((f) => f.unidad)).size > 1;

  const visibles = useMemo(() => {
    const t = normalizar(q.trim());
    return filas
      .filter((f) => !t || f.legajo.includes(t) || normalizar(f.nombre).includes(t))
      .filter((f) => filtro === 'todos' || (filtro === 'enviadas' ? f.estado === 'enviada' : f.estado !== 'enviada'))
      .sort((a, b) => Number(a.estado === 'enviada') - Number(b.estado === 'enviada') || a.nombre.localeCompare(b.nombre, 'es'));
  }, [filas, q, filtro]);

  const chips: [Filtro, string, number][] = [
    ['todos', 'Todos', filas.length],
    ['pendientes', 'Por evaluar', filas.length - enviadas],
    ['enviadas', 'Enviadas', enviadas],
  ];
  const ejemplo = filas[0];

  return (
    <section className="card list-card">
      <div className="tools">
        <div className="field">
          <label htmlFor="q">Buscar por legajo o apellido y nombre</label>
          <input
            id="q"
            type="search"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={ejemplo ? `Ej.: ${ejemplo.legajo} o ${ejemplo.nombre.split(/[ ,]/)[0]}` : ''}
          />
        </div>
        <div className="chips" role="group" aria-label="Filtrar por estado">
          {chips.map(([k, l, n]) => (
            <button key={k} className="chip" aria-pressed={filtro === k} onClick={() => setFiltro(k)}>
              {l}
              <span className="n">{n}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="list-head" aria-hidden="true">
        <span>Legajo</span><span>Apellido y nombre</span><span>Estado</span><span>Puntaje</span><span />
      </div>
      {visibles.length === 0 ? (
        <div className="empty">
          {q.trim() ? (
            <>
              <p>No hay nadie con «{q.trim()}» en tu equipo.</p>
              <p>Si la persona trabaja con vos pero no aparece, pedí que la sumen más abajo.</p>
            </>
          ) : (
            <p>No hay agentes en este filtro.</p>
          )}
        </div>
      ) : (
        visibles.map((f) => {
          const c = categoria(f.total);
          return (
            <div key={f.legajo} className={`row${marcado === f.legajo ? ' flash' : ''}`}>
              <span className="leg">{f.legajo}</span>
              <div className="who">
                <strong>{f.nombre}</strong>
                <span>
                  <span className="leg-m">Legajo {f.legajo}{variasUnidades ? ' · ' : ''}</span>
                  {variasUnidades ? f.unidad : null}
                </span>
              </div>
              <div className="meta">
                <div>
                  {f.estado === 'enviada' ? (
                    <span className="pill ok">Enviada {f.fecha}</span>
                  ) : f.estado === 'borrador' ? (
                    <span className="pill warn">Borrador · {f.respondidas}/10</span>
                  ) : (
                    <span className="pill">Sin evaluar</span>
                  )}
                </div>
                <div className="score">
                  {f.estado === 'enviada' ? (
                    <>
                      <span>{f.total}</span>
                      <span className={`chip-cat cat-${c.id}`}>{c.nombre}</span>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
              </div>
              <Link
                href={`/equipo/${encodeURIComponent(f.legajo)}`}
                className={`btn sm${f.estado === 'enviada' ? '' : ' primary'}`}
              >
                {f.estado === 'enviada' ? 'Ver o editar' : f.estado === 'borrador' ? 'Continuar' : 'Evaluar'}
              </Link>
            </div>
          );
        })
      )}
    </section>
  );
}
