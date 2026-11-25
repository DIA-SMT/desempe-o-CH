import { redirigirAca } from '@/lib/redireccion';
import { clienteServidor } from '@/lib/supabase/servidor';

export async function POST() {
  const supabase = await clienteServidor();
  await supabase.auth.signOut();
  return redirigirAca('/ingresar', 303);
}
