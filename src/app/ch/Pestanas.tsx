'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Pestanas({ pendientes }: { pendientes: number }) {
  const ruta = usePathname();
  const tabs: [string, string][] = [
    ['/ch', 'Tablero'],
    ['/ch/seguimiento', 'Seguimiento'],
    ['/ch/evaluaciones', 'Evaluaciones'],
    ['/ch/configuracion', 'Configuración'],
  ];
  return (
    <nav className="tabs" aria-label="Secciones del panel">
      {tabs.map(([href, nombre]) => {
        const activa = href === '/ch' ? ruta === '/ch' : ruta.startsWith(href);
        return (
          <Link key={href} href={href} className="tab" aria-current={activa ? 'page' : undefined} style={{ textDecoration: 'none' }}>
            {nombre}
            {href === '/ch/seguimiento' && pendientes > 0 && (
              <span className="n" aria-label={`${pendientes} solicitudes pendientes`}>{pendientes}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
