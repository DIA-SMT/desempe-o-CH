'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export interface CampoFiltro {
  nombre: string;
  etiqueta: string;
  opciones?: { valor: string; texto: string }[]; // sin opciones: campo de búsqueda
  todas?: string;
}

// Fila de filtros que actualiza la dirección (?campo=valor); la página se vuelve a calcular en el servidor.
export function Filtros({ campos, resumen }: { campos: CampoFiltro[]; resumen?: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [texto, setTexto] = useState<Record<string, string>>(() =>
    Object.fromEntries(campos.filter((c) => !c.opciones).map((c) => [c.nombre, params.get(c.nombre) ?? ''])),
  );

  const aplicar = (nombre: string, valor: string) => {
    const p = new URLSearchParams(params);
    if (valor) p.set(nombre, valor); else p.delete(nombre);
    p.delete('pagina');
    router.replace(p.size ? `${ruta}?${p}` : ruta, { scroll: false });
  };

  // La búsqueda espera a que se deje de tipear
  useEffect(() => {
    const t = setTimeout(() => {
      for (const [k, v] of Object.entries(texto)) if ((params.get(k) ?? '') !== v.trim()) aplicar(k, v.trim());
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  return (
    <div className="filters">
      {campos.map((c) => (
        <div key={c.nombre} className="field">
          <label htmlFor={`f-${c.nombre}`}>{c.etiqueta}</label>
          {c.opciones ? (
            <select id={`f-${c.nombre}`} value={params.get(c.nombre) ?? ''} onChange={(e) => aplicar(c.nombre, e.target.value)}>
              <option value="">{c.todas ?? 'Todas'}</option>
              {c.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
            </select>
          ) : (
            <input id={`f-${c.nombre}`} type="search" autoComplete="off" value={texto[c.nombre] ?? ''}
              onChange={(e) => setTexto({ ...texto, [c.nombre]: e.target.value })} />
          )}
        </div>
      ))}
      {resumen && <p className="count">{resumen}</p>}
    </div>
  );
}
