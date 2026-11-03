'use client';

import { useState } from 'react';

export type Tema = 'claro' | 'oscuro';

// Modo día o noche. Por defecto, día. La elección se guarda en una cookie para que el servidor
// mande la página ya con el tema elegido, sin parpadeo.
export function BotonTema({ inicial }: { inicial: Tema }) {
  const [tema, setTema] = useState<Tema>(inicial);
  const oscuro = tema === 'oscuro';

  const cambiar = () => {
    const nuevo: Tema = oscuro ? 'claro' : 'oscuro';
    document.documentElement.dataset.theme = nuevo === 'oscuro' ? 'dark' : 'light';
    document.cookie = `tema=${nuevo}; path=/; max-age=31536000; samesite=lax`;
    setTema(nuevo);
  };

  return (
    <button type="button" className="btn sm tema" onClick={cambiar}
      aria-label={oscuro ? 'Pasar a modo día' : 'Pasar a modo noche'} title={oscuro ? 'Modo día' : 'Modo noche'}>
      {oscuro ? (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
        </svg>
      )}
    </button>
  );
}
