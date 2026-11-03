'use client';

import { useEffect, useState, useTransition } from 'react';
import { MAIL_CH } from '@/lib/contacto';
import { consultarLegajo, pedirAgente, type AgenteEncontrado } from './actions';

export interface SolicitudPropia {
  id: number;
  legajo: string;
  nombre: string;
  motivo: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
}

const MOTIVOS = ['Pasó a trabajar en mi área', 'Está en comisión en mi área', 'Otro motivo'];

export function SolicitudAgente({ solicitudes }: { solicitudes: SolicitudPropia[] }) {
  const [legajo, setLegajo] = useState('');
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [hallado, setHallado] = useState<AgenteEncontrado | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [pendiente, iniciar] = useTransition();

  useEffect(() => {
    setHallado(null);
    setMensaje('');
    if (legajo.length < 4) return;
    const t = setTimeout(async () => {
      const r = await consultarLegajo(legajo);
      if ('error' in r) setMensaje(r.error);
      else if (r.enEquipo) setMensaje(`${r.nombre} ya está en tu lista.`);
      else { setHallado(r); setMensaje(`${r.nombre}, hoy figura en ${r.unidad}.`); }
    }, 350);
    return () => clearTimeout(t);
  }, [legajo]);

  const enviar = () =>
    iniciar(async () => {
      const r = await pedirAgente(legajo, motivo);
      if (r.error) setMensaje(r.error);
      else { setLegajo(''); setMensaje('Solicitud enviada a Capital Humano.'); }
    });

  return (
    <section className="card req">
      <h2>¿Falta alguien de tu equipo?</h2>
      <p className="sub">
        Si una persona trabaja con vos pero no aparece en la lista, ingresá su legajo. Capital Humano revisa el pedido y la
        suma a tu equipo. Si no encontrás el legajo o necesitás otro cambio, escribí a{' '}
        <a href={`mailto:${MAIL_CH}`}>{MAIL_CH}</a>.
      </p>
      <div className="req-form">
        <div className="field">
          <label htmlFor="req-leg">Legajo</label>
          <input
            id="req-leg"
            type="text"
            inputMode="numeric"
            maxLength={8}
            autoComplete="off"
            value={legajo}
            onChange={(e) => setLegajo(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter' && hallado && !pendiente) enviar(); }}
          />
        </div>
        <div className="field">
          <label htmlFor="req-mot">Motivo</label>
          <select id="req-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {MOTIVOS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <button className="btn" onClick={enviar} disabled={!hallado || pendiente}>
          {pendiente ? 'Enviando…' : 'Enviar a Capital Humano'}
        </button>
      </div>
      <p className="hint" aria-live="polite">{mensaje}</p>
      {solicitudes.length > 0 && (
        <ul className="req-list">
          {solicitudes.map((s) => (
            <li key={s.id}>
              <span><strong>{s.nombre}</strong> · legajo {s.legajo} · {s.motivo}</span>
              {s.estado === 'aprobada' ? <span className="pill ok">Aprobada</span>
                : s.estado === 'rechazada' ? <span className="pill bad">Rechazada</span>
                : <span className="pill warn">En revisión</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
