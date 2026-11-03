'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { preguntasRapidas, respuestaRapida, type ContextoAsistente } from '@/lib/asistente';

interface Mensaje { rol: 'usuario' | 'migue'; texto: string }

const SALUDO = '¡Hola! Soy Migue. Te ayudo con la evaluación de desempeño: elegí una pregunta o escribime la tuya.';

// Botón flotante con Migue y su panel de conversación
export function Asistente() {
  const [abierto, setAbierto] = useState(false);
  const [ctx, setCtx] = useState<(ContextoAsistente & { disponible: boolean }) | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([{ rol: 'migue', texto: SALUDO }]);
  const [texto, setTexto] = useState('');
  const [escribiendo, setEscribiendo] = useState(false);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  // Los datos se piden cada vez que se abre, para que el avance esté al día
  useEffect(() => {
    if (!abierto) return;
    campo.current?.focus();
    fetch('/api/migue').then((r) => (r.ok ? r.json() : null)).then(setCtx).catch(() => setCtx(null));
  }, [abierto]);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [mensajes]);

  const rapida = (id: string, pregunta: string) => {
    if (!ctx) return;
    setMensajes((m) => [...m, { rol: 'usuario', texto: pregunta }, { rol: 'migue', texto: respuestaRapida(id, ctx) }]);
  };

  const enviar = async (e?: FormEvent) => {
    e?.preventDefault();
    const pregunta = texto.trim();
    if (!pregunta || escribiendo) return;
    const historial = [...mensajes.slice(1), { rol: 'usuario' as const, texto: pregunta }];
    setMensajes((m) => [...m, { rol: 'usuario', texto: pregunta }, { rol: 'migue', texto: '' }]);
    setTexto('');
    setEscribiendo(true);
    const agregar = (parte: string) =>
      setMensajes((m) => [...m.slice(0, -1), { rol: 'migue', texto: m[m.length - 1].texto + parte }]);
    try {
      const r = await fetch('/api/migue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensajes: historial }),
      });
      if (!r.ok || !r.body) {
        agregar(r.status === 401 ? 'Tu sesión venció. Volvé a ingresar.' : await r.text());
        return;
      }
      const lector = r.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        agregar(value);
      }
    } catch {
      agregar('No me pude conectar. Revisá tu conexión y probá de nuevo.');
    } finally {
      setEscribiendo(false);
    }
  };

  const teclas = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
  };

  return (
    <>
      {abierto && (
        <section className="asistente card" role="dialog" aria-label="Migue, asistente de la evaluación"
          onKeyDown={(e) => e.key === 'Escape' && setAbierto(false)}>
          <header className="as-h">
            <span className="as-cara"><Image src="/migue.jpeg" alt="" width={80} height={80} /></span>
            <div><strong>Migue</strong><span>Asistente de la evaluación</span></div>
            <button className="as-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar">×</button>
          </header>
          <div className="as-msgs" ref={lista} aria-live="polite">
            {mensajes.map((m, i) => (
              <p key={i} className={`as-msg ${m.rol}`}>{m.texto || <span className="as-puntos" aria-label="Escribiendo">···</span>}</p>
            ))}
          </div>
          {ctx && (
            <div className="as-rapidas" role="group" aria-label="Preguntas rápidas">
              {preguntasRapidas(ctx).map((p) => (
                <button key={p.id} className="chip" onClick={() => rapida(p.id, p.texto)}>{p.texto}</button>
              ))}
            </div>
          )}
          <form className="as-form" onSubmit={enviar}>
            <textarea ref={campo} rows={1} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={teclas}
              maxLength={1000} placeholder={ctx && !ctx.disponible ? 'Por ahora, usá las preguntas rápidas' : 'Escribí tu pregunta'}
              disabled={!!ctx && !ctx.disponible} aria-label="Tu pregunta" />
            <button className="btn primary sm" disabled={!texto.trim() || escribiendo || (!!ctx && !ctx.disponible)}>Enviar</button>
          </form>
          <p className="as-nota">Migue es un asistente automático y puede equivocarse. No le escribas datos de otras personas.</p>
        </section>
      )}
      <button className="as-boton" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}
        aria-label={abierto ? 'Cerrar a Migue' : 'Preguntale a Migue'}>
        <Image src="/migue.jpeg" alt="" width={120} height={120} />
        {!abierto && <span className="as-etiqueta">¿Dudas? Preguntale a Migue</span>}
      </button>
    </>
  );
}
