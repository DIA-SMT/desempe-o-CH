'use client';

import { useState } from 'react';

// Copia los mails de los evaluadores con pendientes para mandar un recordatorio desde el correo
export function CopiarMails({ mails }: { mails: string[] }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mails.join('; '));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      prompt('Copiá los mails:', mails.join('; '));
    }
  };
  return (
    <button className="btn" onClick={copiar}>
      {copiado ? `✓ ${mails.length} mails copiados` : `Copiar mails de pendientes (${mails.length})`}
    </button>
  );
}
