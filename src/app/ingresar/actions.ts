'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { clienteAdmin } from '@/lib/supabase/admin';
import { clienteServidor } from '@/lib/supabase/servidor';

export interface EstadoIngreso {
  error?: string;
  enviado?: string;
}

const MAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NO_HABILITADO = 'Ese mail no está habilitado para evaluar. Pedile a la Dirección de Capital Humano que te dé de alta.';

async function estaHabilitado(email: string) {
  const { data, error } = await clienteAdmin().from('usuarios').select('id').eq('email', email).eq('activo', true).maybeSingle();
  if (error) throw new Error(error.message); // un error de la base no es "no habilitado"
  return !!data;
}

// Ingreso con mail y contraseña. La cuenta se crea en Supabase (Authentication > Users)
// y además la persona tiene que estar en la tabla usuarios.
export async function ingresarConClave(_: EstadoIngreso, form: FormData): Promise<EstadoIngreso> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const clave = String(form.get('clave') ?? '');
  if (!MAIL.test(email) || !clave) return { error: 'Completá tu mail institucional y tu contraseña.' };

  try {
    if (!(await estaHabilitado(email))) return { error: NO_HABILITADO };
    const supabase = await clienteServidor();
    const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
    if (error) {
      return { error: /not confirmed/i.test(error.message)
        ? 'Tu cuenta todavía no está confirmada. Pedile a Capital Humano que la confirme.'
        : 'El mail o la contraseña no son correctos.' };
    }
  } catch (e) {
    console.error('Error al ingresar con contraseña:', e);
    return { error: 'El sistema no está disponible en este momento. Probá de nuevo más tarde.' };
  }
  redirect('/');
}

// Ingreso con enlace por mail. Solo reciben enlace los mails dados de alta por Capital Humano.
export async function pedirEnlace(estado: EstadoIngreso, form: FormData): Promise<EstadoIngreso> {
  try {
    return await enviarEnlace(form);
  } catch (e) {
    console.error('Error al pedir enlace de ingreso:', e);
    return { error: 'El sistema no está disponible en este momento. Probá de nuevo más tarde.' };
  }
}

async function enviarEnlace(form: FormData): Promise<EstadoIngreso> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!MAIL.test(email)) {
    return { error: 'Revisá el mail: tiene que tener la forma nombre@smt.gob.ar.' };
  }
  if (!(await estaHabilitado(email))) return { error: NO_HABILITADO };

  // La cuenta de acceso se crea la primera vez que la persona pide el enlace
  const admin = clienteAdmin();
  const { error: errorAlta } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (errorAlta && !/already|registered|exists/i.test(errorAlta.message)) {
    return { error: 'No pudimos preparar tu acceso. Probá de nuevo en unos minutos.' };
  }

  const origen = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL;
  const supabase = await clienteServidor();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origen}/auth/confirm` },
  });
  if (error) {
    return { error: /rate|seconds/i.test(error.message)
      ? 'Ya te enviamos un enlace hace instantes. Esperá un minuto antes de pedir otro.'
      : 'No pudimos enviar el enlace. Probá de nuevo en unos minutos.' };
  }
  return { enviado: email };
}
