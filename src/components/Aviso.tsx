'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Muestra el aviso que dejó una acción (?aviso=...) y lo saca de la dirección.
export function Aviso() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [texto, setTexto] = useState<string | null>(null);

  useEffect(() => {
    const aviso = params.get('aviso');
    if (!aviso) return;
    setTexto(aviso);
    const resto = new URLSearchParams(params);
    resto.delete('aviso');
    router.replace(resto.size ? `${pathname}?${resto}` : pathname, { scroll: false });
    const t = setTimeout(() => setTexto(null), 4000);
    return () => clearTimeout(t);
  }, [params, pathname, router]);

  if (!texto) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {texto}
    </div>
  );
}
