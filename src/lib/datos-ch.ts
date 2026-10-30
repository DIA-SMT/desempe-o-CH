// Datos para el panel de Capital Humano. Se leen con la clave de servicio, así que
// cada página debe llamar antes a requerirCH(). Los puntajes individuales solo se
// muestran a quien puedeVerRespuestas(); el resto ve agregados y estados.

import { clienteAdmin, traerTodo } from './supabase/admin';
import type { FilaCompetencia, FilaEvaluacion, FilaPadron } from './tipos';

export interface DatosPeriodo {
  padron: FilaPadron[];
  evaluaciones: FilaEvaluacion[];
  competencias: FilaCompetencia[];
}

export async function datosPeriodo(periodoId: number): Promise<DatosPeriodo> {
  const db = clienteAdmin();
  const [padron, evaluaciones, { data: competencias }] = await Promise.all([
    traerTodo<FilaPadron>((d, h) =>
      db.from('padron_periodo').select('legajo, nombre, unidad_codigo, unidad_nombre, secretaria, evaluador_id')
        .eq('periodo_id', periodoId).order('legajo').range(d, h)),
    traerTodo<FilaEvaluacion>((d, h) =>
      db.from('evaluaciones').select('legajo, estado, total, puntajes, agrupamiento, evaluador_id, enviada_en, actualizada_en')
        .eq('periodo_id', periodoId).order('legajo').range(d, h)),
    db.from('competencias').select('orden, tipo, nombre, descripcion').eq('periodo_id', periodoId).order('orden'),
  ]);
  return { padron, evaluaciones, competencias: (competencias ?? []) as FilaCompetencia[] };
}

export interface Evaluador { id: string; nombre: string; email: string; legajo: string | null; activo: boolean }

export async function evaluadores(): Promise<Map<string, Evaluador>> {
  const db = clienteAdmin();
  const filas = await traerTodo<Evaluador>((d, h) => db.from('usuarios').select('id, nombre, email, legajo, activo').range(d, h));
  return new Map(filas.map((u) => [u.id, u]));
}
