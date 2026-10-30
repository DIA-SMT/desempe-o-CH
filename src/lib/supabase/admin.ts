import { createClient } from '@supabase/supabase-js';

// Cliente con la clave de servicio: saltea RLS. Usar solo en el servidor y siempre
// después de verificar el rol del usuario en la aplicación.
export function clienteAdmin() {
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clave) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// PostgREST devuelve hasta 1000 filas por consulta: esto trae todas, de a páginas.
export async function traerTodo<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  tamano = 1000,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += tamano) {
    const { data, error } = await consulta(desde, desde + tamano - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < tamano) return filas;
  }
}
