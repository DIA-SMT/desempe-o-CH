'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Regla } from '@/components/Escala';
import { AGRUPAMIENTOS, categoria, respondidas, sumar } from '@/lib/escala';
import type { FilaCompetencia } from '@/lib/tipos';
import { guardarEvaluacion } from '../actions';

interface Props {
  agente: { legajo: string; nombre: string; unidad: string };
  evaluador: string;
  competencias: FilaCompetencia[];
  inicial: { puntajes: (number | null)[]; agrupamiento: string | null; observaciones: string; enviada: boolean };
  nota: string | null;
  cierre: string;
  historial: { periodo: string; total: number }[]; // vacío hasta que se envía la de este período
}

export function FormEvaluacion({ agente, evaluador, competencias, inicial, nota, cierre, historial }: Props) {
  const router = useRouter();
  const [puntajes, setPuntajes] = useState(inicial.puntajes);
  const [agrupamiento, setAgrupamiento] = useState(inicial.agrupamiento ?? '');
  const [obs, setObs] = useState(inicial.observaciones);
  const [faltan, setFaltan] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState('');
  const [guardando, iniciar] = useTransition();
  const sucio = useRef(false);

  const n = respondidas(puntajes);
  const total = sumar(puntajes);
  const completa = n === competencias.length;
  const cat = categoria(total);

  useEffect(() => {
    const avisar = (e: BeforeUnloadEvent) => { if (sucio.current) e.preventDefault(); };
    addEventListener('beforeunload', avisar);
    return () => removeEventListener('beforeunload', avisar);
  }, []);

  const puntuar = (i: number, v: number) => {
    sucio.current = true;
    setPuntajes((p) => p.map((x, j) => (j === i ? v : x)));
    setFaltan((f) => { const s = new Set(f); s.delete(`c${i}`); return s; });
    setConfirmar(false);
  };

  const guardar = (enviar: boolean) =>
    iniciar(async () => {
      setError('');
      sucio.current = false;
      const r = await guardarEvaluacion({ legajo: agente.legajo, puntajes, agrupamiento: agrupamiento || null, observaciones: obs, enviar });
      if (r?.error) { sucio.current = true; setError(r.error); setConfirmar(false); }
    });

  const intentarEnviar = () => {
    const f = new Set<string>();
    puntajes.forEach((v, i) => { if (v == null) f.add(`c${i}`); });
    if (!agrupamiento) f.add('agrup');
    if (f.size) {
      setFaltan(f);
      const primero = document.getElementById(f.has('agrup') ? 'bloque-agrup' : `comp-${[...f][0].slice(1)}`);
      primero?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      const cant = puntajes.filter((v) => v == null).length;
      setError([cant ? `Falta puntuar ${cant} ${cant === 1 ? 'competencia' : 'competencias'}` : '', !agrupamiento ? 'falta el agrupamiento' : ''].filter(Boolean).join(' y ') + '.');
      return;
    }
    setError('');
    setConfirmar(true);
  };

  const volver = () => {
    if (sucio.current && !inicial.enviada && (n > 0 || obs)) guardar(false);
    else { sucio.current = false; router.push('/equipo'); }
  };

  const grupo = (tipo: 'G' | 'E', titulo: string) => {
    const items = competencias.map((c, i) => [c, i] as const).filter(([c]) => c.tipo === tipo);
    if (!items.length) return null;
    return (
      <section className="group">
        <div className="group-h"><h2>{titulo}</h2><span>{items.length} competencias</span></div>
        {items.map(([c, i]) => {
          const v = puntajes[i];
          return (
            <fieldset key={c.orden} id={`comp-${i}`} className={`card comp${v != null ? ' done' : ''}${faltan.has(`c${i}`) ? ' missing' : ''}`}>
              <legend>
                <span className="comp-name">{c.nombre}</span>
                <span className="comp-st">{v != null ? `✓ ${v} de 10` : faltan.has(`c${i}`) ? 'Falta puntuar' : 'Sin puntuar'}</span>
              </legend>
              <p className="comp-desc">{c.descripcion}</p>
              <div className="scale">
                {Array.from({ length: 10 }, (_, k) => k + 1).map((p) => (
                  <span key={p} style={{ display: 'contents' }}>
                    <input type="radio" name={`c${i}`} id={`c${i}-${p}`} value={p} checked={v === p} onChange={() => puntuar(i, p)} />
                    <label htmlFor={`c${i}-${p}`}>{p}</label>
                  </span>
                ))}
              </div>
              <div className="scale-ends" aria-hidden="true"><span>1 · más bajo</span><span>10 · más alto</span></div>
            </fieldset>
          );
        })}
      </section>
    );
  };

  return (
    <>
      <button className="btn ghost" onClick={volver} disabled={guardando}>← Volver a mi equipo</button>
      <section className="card agent">
        <div style={{ display: 'grid', gap: 6 }}>
          <p className="eyebrow">Agente evaluado</p>
          <h1>{agente.nombre}</h1>
        </div>
        <dl className="facts">
          <div><dt>Legajo</dt><dd className="num">{agente.legajo}</dd></div>
          <div><dt>Unidad</dt><dd>{agente.unidad}</dd></div>
          <div><dt>Evalúa</dt><dd>{evaluador}</dd></div>
          {historial.length > 0 && (
            <div>
              <dt>Semestres anteriores</dt>
              <dd>{historial.map((h) => `${h.periodo}: ${h.total} (${categoria(h.total).nombre})`).join(' · ')}</dd>
            </div>
          )}
        </dl>
        {nota && <p className="note">{nota}</p>}
      </section>

      <section id="bloque-agrup" className={`card comp${agrupamiento ? ' done' : ''}${faltan.has('agrup') ? ' missing' : ''}`} style={{ marginBottom: 18 }}>
        <div className="agrup">
          <label className="lbl" htmlFor="agrup">Agrupamiento</label>
          <select id="agrup" value={agrupamiento} onChange={(e) => { sucio.current = true; setAgrupamiento(e.target.value); setFaltan((f) => { const s = new Set(f); s.delete('agrup'); return s; }); }}>
            <option value="">Elegí el agrupamiento</option>
            {AGRUPAMIENTOS.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        </div>
      </section>

      <p className="instr">Puntuá cada competencia del 1 al 10. La suma de las {competencias.length} da el puntaje final sobre 100 y la categoría.</p>

      <form onSubmit={(e) => e.preventDefault()} noValidate>
        {grupo('G', 'Competencias genéricas')}
        {grupo('E', 'Competencias específicas')}

        <section className="card obs">
          <label className="lbl" htmlFor="obs">Observaciones (opcional)</label>
          <textarea id="obs" maxLength={600} rows={3} value={obs}
            placeholder="Fortalezas, aspectos a mejorar o contexto que Capital Humano deba conocer"
            onChange={(e) => { sucio.current = true; setObs(e.target.value); }} />
          <span className="obs-n">{obs.length}/600</span>
        </section>

        <div className="scorebar">
          <div className="sb-score">
            <span className={`sb-num${completa ? '' : ' partial'}`}>{total}</span>
            <span className="sb-max">/100</span>
          </div>
          <div className="sb-mid">
            <div className="sb-line">
              {completa ? (
                <><span className={`chip-cat cat-${cat.id}`}>{cat.nombre}</span><span>Las {competencias.length} competencias están puntuadas.</span></>
              ) : (
                <span>Puntaje parcial · faltan {competencias.length - n} de {competencias.length} competencias</span>
              )}
            </div>
            <Regla total={completa ? total : null} sinMarcas />
          </div>
          <div className="sb-actions">
            {!inicial.enviada && (
              <button type="button" className="btn" onClick={() => guardar(false)} disabled={guardando}>Guardar borrador</button>
            )}
            <button type="button" className="btn primary" onClick={intentarEnviar} disabled={guardando}>
              {inicial.enviada ? 'Guardar cambios' : 'Enviar evaluación'}
            </button>
          </div>
          {error && <p className="error-msg" role="alert" style={{ gridColumn: '1 / -1' }}>{error}</p>}
          {confirmar && (
            <div className="sb-confirm">
              <p>
                {inicial.enviada ? 'Vas a actualizar' : 'Vas a enviar'} la evaluación de <strong>{agente.nombre}</strong> con{' '}
                <strong>{total} puntos ({cat.nombre})</strong>. Podés modificarla hasta el {cierre}.
              </p>
              <div>
                <button type="button" className="btn" onClick={() => setConfirmar(false)} disabled={guardando}>Revisar</button>
                <button type="button" className="btn primary" onClick={() => guardar(true)} disabled={guardando} autoFocus>
                  {guardando ? 'Guardando…' : inicial.enviada ? 'Confirmar cambios' : 'Confirmar envío'}
                </button>
              </div>
            </div>
          )}
        </div>
      </form>
    </>
  );
}
