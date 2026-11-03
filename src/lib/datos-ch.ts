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

// Resultados agregados de cada período con evaluaciones, incluidos los históricos, del más viejo al más nuevo
export interface ResumenPeriodo {
  periodo_id: number; nombre: string; cierre: string; historico: boolean;
  evaluadas: number; promedio: number; basico: number; intermedio: number; avanzado: number; experto: number; lider: number;
  todo_igual: number;
}

export async function resumenPeriodos(secretaria?: string): Promise<ResumenPeriodo[]> {
  const { data, error } = await clienteAdmin().rpc('resumen_periodos', { p_secretaria: secretaria || null });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ResumenPeriodo[]).map((r) => ({ ...r, promedio: Number(r.promedio) }));
}

// Último ingreso de cada cuenta de acceso, por mail
export async function ultimosIngresos(): Promise<Map<string, string>> {
  const admin = clienteAdmin().auth.admin;
  const ingresos = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const u of data.users) if (u.email && u.last_sign_in_at) ingresos.set(u.email.toLowerCase(), u.last_sign_in_at);
    if (data.users.length < 1000) return ingresos;
  }
}

export interface Evaluador { id: string; nombre: string; email: string; legajo: string | null; activo: boolean }

export async function evaluadores(): Promise<Map<string, Evaluador>> {
  const db = clienteAdmin();
  const filas = await traerTodo<Evaluador>((d, h) => db.from('usuarios').select('id, nombre, email, legajo, activo').range(d, h));
  return new Map(filas.map((u) => [u.id, u]));
}
