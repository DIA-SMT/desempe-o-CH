'use client';

import { useActionState } from 'react';
import { MAIL_CH } from '@/lib/contacto';
import { vincularLegajo, type EstadoVincular, type SinEvaluaciones } from './actions';

function SinNadieACargo({ s }: { s: SinEvaluaciones }) {
  const tuEvaluacion =
    s.evaluador ? <>A vos te evalúa <strong>{s.evaluador}</strong>{s.unidad ? ` (${s.unidad})` : ''}.</>
    : s.motivo === 'funcionario' ? 'Como sos funcionario, en este período no se te evalúa.'
    : s.motivo === 'convenio' ? 'El personal de convenio 5 no se evalúa en este período.'
    : s.motivo === 'legajo' ? 'Con tu tipo de legajo no se te evalúa en este período.'
    : s.motivo === 'sin-asignar' ? `Todavía no está definido quién te evalúa${s.unidad ? ` en ${s.unidad}` : ''}: lo asigna Capital Humano.`
    : null;
  return (
    <div className="ok-msg" role="status" style={{ display: 'grid', gap: 6 }}>
      <p>Este sistema lo usan los directores, subsecretarios y secretarios para evaluar a su personal. Vos no tenés a nadie a cargo para evaluar.</p>
      {tuEvaluacion && <p>{tuEvaluacion}</p>}
      <p>
        Si sos director o directora y esperabas evaluar a tu equipo, escribí a <a href={`mailto:${MAIL_CH}`}>{MAIL_CH}</a> con tu legajo.
      </p>
    </div>
  );
}

export function FormVincular() {
  const [estado, accion, vinculando] = useActionState<EstadoVincular, FormData>(vincularLegajo, {});

  if (estado.sinEvaluaciones) return <SinNadieACargo s={estado.sinEvaluaciones} />;

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
