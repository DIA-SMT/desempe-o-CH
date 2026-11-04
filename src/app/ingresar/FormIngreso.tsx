'use client';

import { useActionState, useState } from 'react';
import { ingresarConClave, pedirEnlace, type EstadoIngreso } from './actions';

export function FormIngreso() {
  const [modo, setModo] = useState<'clave' | 'enlace'>('clave');
  const [conClave, accionClave, entrando] = useActionState<EstadoIngreso, FormData>(ingresarConClave, {});
  const [conEnlace, accionEnlace, enviando] = useActionState<EstadoIngreso, FormData>(pedirEnlace, {});

  if (modo === 'enlace' && conEnlace.enviado) {
    return (
      <div className="ok-msg" role="status">
        Te enviamos un enlace a <strong>{conEnlace.enviado}</strong>. Abrilo desde este mismo navegador para entrar. Si no lo
        ves en unos minutos, revisá la carpeta de correo no deseado.
      </div>
    );
  }

  if (modo === 'enlace') {
    return (
      <form action={accionEnlace}>
        <div className="field">
          <label htmlFor="email-enlace">Mail institucional</label>
          <input id="email-enlace" name="email" type="email" autoComplete="email" required placeholder="nombre@smt.gob.ar" />
        </div>
        {conEnlace.error && <p className="error-msg" role="alert">{conEnlace.error}</p>}
        <div className="acciones">
          <button className="btn primary" type="submit" disabled={enviando}>{enviando ? 'Enviando…' : 'Recibir enlace de ingreso'}</button>
          <button className="linkbtn" type="button" onClick={() => setModo('clave')}>Ingresar con contraseña</button>
        </div>
      </form>
    );
  }

  return (
    <form action={accionClave}>
      <div className="field">
        <label htmlFor="email">Mail institucional</label>
        <input id="email" name="email" type="email" autoComplete="username" required placeholder="nombre@smt.gob.ar" />
      </div>
      <div className="field">
        <label htmlFor="clave">Contraseña</label>
        <input id="clave" name="clave" type="password" autoComplete="current-password" required />
      </div>
      {conClave.error && <p className="error-msg" role="alert">{conClave.error}</p>}
      <div className="acciones">
        <button className="btn primary" type="submit" disabled={entrando}>{entrando ? 'Ingresando…' : 'Ingresar'}</button>
        <button className="linkbtn" type="button" onClick={() => setModo('enlace')}>Prefiero recibir un enlace por mail</button>
      </div>
    </form>
  );
}
