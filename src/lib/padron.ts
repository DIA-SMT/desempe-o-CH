import { clienteAdmin } from './supabase/admin';

// Sincroniza unidades y agentes desde CapitalIA (API de solo lectura).
// Lo que ya no viene en la API queda marcado como inactivo; nunca se borra,
// porque las evaluaciones de períodos anteriores lo siguen referenciando.

const BASE = 'https://capital-ia-eight.vercel.app/api/padron';

interface UnidadAPI { codigo: string; nombre: string; tipo: string; idGrh: string | null; dependeDe: string | null; activa: boolean }
interface AgenteAPI { legajo: string; nombre: string; activo: boolean; reparticionCodigo: string; reparticionIdGrh: string | null; secretaria: string | null }

async function traer<T>(recurso?: string): Promise<{ generado: string; datos: T[] }> {
  const token = process.env.PADRON_API_TOKEN;
  if (!token) throw new Error('Falta PADRON_API_TOKEN en el entorno del servidor');
  const res = await fetch(recurso ? `${BASE}?recurso=${recurso}` : BASE, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`CapitalIA respondió ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json.datos) || json.total !== json.datos.length) {
    throw new Error(`CapitalIA informó ${json.total} registros pero llegaron ${json.datos?.length}`);
  }
  return json;
}

async function enLotes<T>(filas: T[], fn: (lote: T[]) => PromiseLike<{ error: { message: string } | null }>) {
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await fn(filas.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
}

export async function sincronizarPadron() {
  const [unidades, agentes] = await Promise.all([traer<UnidadAPI>('reparticiones'), traer<AgenteAPI>()]);
  const db = clienteAdmin();
  const ahora = new Date().toISOString();

  await enLotes(
    unidades.datos.map((u) => ({ codigo: u.codigo, nombre: u.nombre, tipo: u.tipo, id_grh: u.idGrh, depende_de: u.dependeDe, activa: u.activa, sincronizado_en: ahora })),
    (lote) => db.from('unidades').upsert(lote, { onConflict: 'codigo' }),
  );
  await enLotes(
    agentes.datos.map((a) => ({ legajo: String(a.legajo), nombre: a.nombre, activo: a.activo, unidad_codigo: a.reparticionCodigo, unidad_id_grh: a.reparticionIdGrh, secretaria: a.secretaria, sincronizado_en: ahora })),
    (lote) => db.from('agentes').upsert(lote, { onConflict: 'legajo' }),
  );

  const baja1 = await db.from('unidades').update({ activa: false }).lt('sincronizado_en', ahora);
  const baja2 = await db.from('agentes').update({ activo: false }).lt('sincronizado_en', ahora);
  if (baja1.error || baja2.error) throw new Error((baja1.error ?? baja2.error)!.message);

  return { generado: agentes.generado, unidades: unidades.datos.length, agentes: agentes.datos.length };
}
