import { cache } from 'react';
import { redirect } from 'next/navigation';
import { clienteServidor } from './supabase/servidor';

export type Rol = 'evaluador' | 'capital_humano' | 'directora_ch' | 'admin';

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  legajo: string | null;
  rol: Rol;
  ve_respuestas: boolean;
}

export const ROLES: Record<Rol, string> = {
  evaluador: 'Director/a evaluador/a',
  capital_humano: 'Capital Humano',
  directora_ch: 'Dirección de Capital Humano',
  admin: 'Administración del sistema',
};

export const esCH = (u: Usuario) => u.rol !== 'evaluador';
export const puedeVerRespuestas = (u: Usuario) =>
  u.rol === 'directora_ch' || u.rol === 'admin' || (u.rol === 'capital_humano' && u.ve_respuestas);
export const puedeGestionarUsuarios = (u: Usuario) => u.rol === 'directora_ch' || u.rol === 'admin';

// Usuario habilitado que inició sesión (o null). Se resuelve una vez por pedido.
export const usuarioActual = cache(async (): Promise<Usuario | null> => {
  const supabase = await clienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data } = await supabase
    .from('usuarios')
    .select('id, email, nombre, legajo, rol, ve_respuestas')
    .eq('email', user.email.toLowerCase())
    .eq('activo', true)
    .maybeSingle();
  return (data as Usuario | null) ?? null;
});

export async function requerirUsuario(): Promise<Usuario> {
  const u = await usuarioActual();
  if (!u) redirect('/ingresar?error=no-habilitado');
  return u;
}

export async function requerirCH(): Promise<Usuario> {
  const u = await requerirUsuario();
  if (!esCH(u)) redirect('/equipo');
  return u;
}
