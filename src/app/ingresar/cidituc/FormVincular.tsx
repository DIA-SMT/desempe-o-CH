'use client';

import { useActionState } from 'react';
import { MAIL_CH } from '@/lib/contacto';
import { vincularLegajo, type EstadoVincular } from './actions';

export function FormVincular() {
  const [estado, accion, vinculando] = useActionState<EstadoVincular, FormData>(vincularLegajo, {});

  if (estado.sinEvaluaciones) {
    return (
      <div className="ok-msg" role="status">
        No tenés evaluaciones para completar en este sistema. Si sos director o directora y esperabas evaluar a tu equipo,
        escribí a <a href={`mailto:${MAIL_CH}`}>{MAIL_CH}</a> con tu legajo.
      </div>
    );
  }

  return (
    <form action={accion}>
      <div className="field">
        <label htmlFor="legajo">Número de legajo</label>
        <input id="legajo" name="legajo" type="text" inputMode="numeric" autoComplete="off" required maxLength={8} autoFocus />
      </div>
      {estado.error && <p className="error-msg" role="alert">{estado.error}</p>}
      <div className="acciones">
        <button className="btn primary" type="submit" disabled={vinculando}>{vinculando ? 'Verificando…' : 'Continuar'}</button>
      </div>
    </form>
  );
}
