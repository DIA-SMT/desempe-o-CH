// Del lado del servidor del ingreso con CiDiTuc: buscar al usuario y abrirle la sesión.
// Quién entra: solo quien ya está en la tabla usuarios (CiDiTuc solo dice quién es la persona;
// el rol y lo que ve son los de su cuenta). La cuenta de administración entra solo con contraseña.

import { cookies } from 'next/headers';
import { COOKIE_STATE, COOKIE_VINCULAR, DURACION_S, leerConfig, verificar } from './cidituc';
import { clienteAdmin } from './supabase/admin';
import { clienteServidor } from './supabase/servidor';

export interface CuentaCidituc { id: string; email: string; rol: string; activo: boolean; dni: string | null }

export async function cuentaPorDni(dni: string): Promise<CuentaCidituc | null> {
  const { data, error } = await clienteAdmin().from('usuarios').select('id, email, rol, activo, dni').eq('dni', dni).maybeSingle();
  if (error) throw new Error(error.message);
  return data as CuentaCidituc | null;
}

// Abre una sesión normal de Supabase para ese mail, sin su contraseña y sin mandar ningún mail:
// generateLink da un token de un solo uso y verifyOtp lo canjea por la sesión (cookies de @supabase/ssr).
export async function abrirSesion(email: string): Promise<void> {
  const admin = clienteAdmin();
  const { error: alta } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (alta && !/already|registered|exists/i.test(alta.message)) throw new Error(alta.message);
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const hash = data?.properties?.hashed_token;
  if (error || !hash) throw new Error(error?.message ?? 'generateLink sin token');
  const { error: canje } = await (await clienteServidor()).auth.verifyOtp({ type: 'email', token_hash: hash });
  if (canje) throw new Error(canje.message);
}

// En local (http) la cookie no puede ser Secure
const segura = () => process.env.NODE_ENV === 'production';

export async function guardarCookie(nombre: string, valor: string, path: string) {
  (await cookies()).set(nombre, valor, { httpOnly: true, secure: segura(), sameSite: 'lax', path, maxAge: DURACION_S });
}

export async function borrarCookie(nombre: string, path: string) {
  (await cookies()).set(nombre, '', { httpOnly: true, secure: segura(), sameSite: 'lax', path, maxAge: 0 });
}

export const PATH_STATE = '/auth/cidituc';
export const PATH_VINCULAR = '/ingresar';
export { COOKIE_STATE, COOKIE_VINCULAR };

// Lo que verificó CiDiTuc de quien está vinculando su legajo (cookie firmada de 10 minutos)
export interface DatosVincular { dni: string; nombre: string; apellido: string; exp: number }

export async function datosVincular(): Promise<DatosVincular | null> {
  const config = leerConfig();
  return config ? verificar<DatosVincular>((await cookies()).get(COOKIE_VINCULAR)?.value, config.secreto) : null;
}
