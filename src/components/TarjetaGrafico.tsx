'use client';

import { useState, type ReactNode } from 'react';

// Tarjeta de gráfico con botón para ver los mismos datos como tabla
export function TarjetaGrafico({ titulo, subtitulo, leyenda, tabla, className, children }: {
  titulo: string;
  subtitulo?: string;
  leyenda?: ReactNode;
  tabla?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <section className={`card chart${className ? ' ' + className : ''}`}>
      <div className="chart-h">
        <div>
          <h2>{titulo}</h2>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        {tabla && (
          <button className="btn sm" aria-pressed={verTabla} onClick={() => setVerTabla(!verTabla)}>
            {verTabla ? 'Ver gráfico' : 'Ver tabla'}
          </button>
        )}
      </div>
      {leyenda}
      {verTabla ? tabla : children}
    </section>
  );
}
