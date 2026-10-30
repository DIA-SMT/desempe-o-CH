import { redirect } from 'next/navigation';
import { esCH, requerirUsuario } from '@/lib/sesion';

export default async function Inicio() {
  const usuario = await requerirUsuario();
  redirect(esCH(usuario) ? '/ch' : '/equipo');
}
