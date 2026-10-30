import type { SupabaseClient } from '@supabase/supabase-js';

export interface Periodo {
  id: number;
  nombre: string;
  inicio: string;
  cierre: string;
  estado: 'preparacion' | 'abierto' | 'cerrado';
  historico: boolean;
  padron_congelado_en: string | null;
}

const CAMPOS = 'id, nombre, inicio, cierre, estado, historico, padron_congelado_en';

// Período en curso: el abierto o, si no hay, el que se está preparando.
export async function periodoActual(supabase: SupabaseClient): Promise<Periodo | null> {
  const { data } = await supabase
    .from('periodos')
    .select(CAMPOS)
    .in('estado', ['abierto', 'preparacion'])
    .order('creado_en', { ascending: false });
  const lista = (data ?? []) as Periodo[];
  return lista.find((p) => p.estado === 'abierto') ?? lista[0] ?? null;
}

// Período anterior con resultados, para comparar (cerrado o histórico importado).
export async function periodoAnterior(supabase: SupabaseClient, actual: Periodo | null): Promise<Periodo | null> {
  let q = supabase.from('periodos').select(CAMPOS).eq('estado', 'cerrado').order('cierre', { ascending: false }).limit(1);
  if (actual) q = q.neq('id', actual.id);
  const { data } = await q;
  return ((data ?? [])[0] as Periodo | undefined) ?? null;
}

export const fecha = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export function diasParaCierre(p: Periodo, hoy = new Date()): number {
  const [y, m, d] = p.cierre.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) / 864e5);
}

export function textoCierre(p: Periodo): string {
  const d = diasParaCierre(p);
  const f = fecha(p.cierre);
  if (d > 1) return `cierra el ${f} (faltan ${d} días)`;
  if (d === 1) return `cierra mañana, ${f}`;
  if (d === 0) return `cierra hoy, ${f}`;
  return `cerró el ${f}`;
}
