'use client';

import { useActionState } from 'react';
import { importarEvaluadores, type ResultadoImportacion } from '../actions';

export function ImportarEvaluadores() {
  const [r, accion, cargando] = useActionState<ResultadoImportacion | null, FormData>(importarEvaluadores, null);
  return (
    <form action={accion} style={{ display: 'grid', gap: 12 }}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="archivo">Planilla completa (CSV)</label>
          <input id="archivo" name="archivo" type="file" accept=".csv,text/csv" required />
        </div>
        <button className="btn primary" type="submit" disabled={cargando} style={{ justifySelf: 'start' }}>
          {cargando ? 'Importando…' : 'Importar evaluadores'}
        </button>
      </div>
      {r && (
        <div className="resultado-import" aria-live="polite">
          {r.asignadas > 0 && (
            <p className="ok-msg">
              {r.asignadas} {r.asignadas === 1 ? 'unidad asignada' : 'unidades asignadas'}
              {r.usuariosNuevos ? `, ${r.usuariosNuevos} evaluadores nuevos dados de alta` : ''}.{r.aviso ? ` ${r.aviso}` : ''}
            </p>
          )}
          {r.errores.length > 0 && (
            <div className="error-msg">
              <p>{r.errores.length === 1 ? 'Una fila no se pudo importar:' : `${r.errores.length} filas no se pudieron importar:`}</p>
              <ul>{r.errores.slice(0, 30).map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
          {!r.asignadas && !r.errores.length && <p className="aviso">La planilla no tiene filas con evaluador cargado.</p>}
        </div>
      )}
    </form>
  );
}
