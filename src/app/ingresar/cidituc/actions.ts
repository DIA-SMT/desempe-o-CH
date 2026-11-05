'use server';

import { redirect } from 'next/navigation';
import { nombresCoinciden } from '@/lib/cidituc';
import { MAIL_CH } from '@/lib/contacto';
import { COOKIE_VINCULAR, PATH_VINCULAR, abrirSesion, borrarCookie, datosVincular } from '@/lib/ingreso-cidituc';
import { periodoActual } from '@/lib/periodos';
import { clienteAdmin } from '@/lib/supabase/admin';

// Quien no evalúa a nadie: si el legajo es suyo, se le cuenta quién lo evalúa o por qué no se lo evalúa
export interface SinEvaluaciones {
  evaluador?: string;
  unidad?: string;
  motivo?: 'funcionario' | 'convenio' | 'legajo' | 'sin-asignar';
}
export interface EstadoVincular { error?: string; sinEvaluaciones?: SinEvaluaciones }

type Db = ReturnType<typeof clienteAdmin>;

async function situacionDeAgente(db: Db, legajo: string, datos: { nombre: string; apellido: string }): Promise<SinEvaluaciones> {
  const { data: agente } = await db.from('agentes').select('nombre').eq('legajo', legajo).maybeSingle();
  // Sin confirmar que el legajo es de quien entró, no se dice nada de esa persona
  if (!agente || !nombresCoinciden(datos, agente.nombre)) return {};
  if (!/^\d{5}$/.test(legajo)) return { motivo: 'legajo' };
  const { data: excluido } = await db.from('no_evaluables').select('motivo').eq('legajo', legajo).maybeSingle();
  if (excluido) return { motivo: excluido.motivo as 'funcionario' | 'convenio' };

  const periodo = await periodoActual(db);
  if (!periodo) return {};
  const { data: fila } = await db.from('padron_periodo').select('unidad_nombre, evaluador_id').eq('periodo_id', periodo.id).eq('legajo', legajo).maybeSingle();
  if (!fila) return {};
  if (!fila.evaluador_id) return { unidad: fila.unidad_nombre, motivo: 'sin-asignar' };
  const { data: evaluador } = await db.from('usuarios').select('nombre').eq('id', fila.evaluador_id).maybeSingle();
  return { evaluador: evaluador?.nombre, unidad: fila.unidad_nombre };
}

const ESCRIBINOS = `Escribí a ${MAIL_CH} y te ayudamos.`;

// Primer ingreso con CiDiTuc: la persona dice su legajo. Se vincula solo si ese legajo está
// habilitado y el nombre que verificó CiDiTuc es el del padrón (así nadie toma un legajo ajeno).
export async function vincularLegajo(_: EstadoVincular, form: FormData): Promise<EstadoVincular> {
  const datos = await datosVincular();
  if (!datos) return { error: 'Pasaron más de 10 minutos desde que ingresaste. Volvé a ingresar con CiDiTuc.' };
  const legajo = String(form.get('legajo') ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (!legajo) return { error: 'Escribí tu número de legajo.' };

  const db = clienteAdmin();
  try {
    const { data: cuentas, error } = await db.from('usuarios').select('id, email, nombre, rol, dni').eq('legajo', legajo).eq('activo', true);
    if (error) throw new Error(error.message);
    if (!cuentas?.length) return { sinEvaluaciones: await situacionDeAgente(db, legajo, datos) };
    if (cuentas.length > 1) return { error: `Hay más de una cuenta con el legajo ${legajo}. ${ESCRIBINOS}` };
    const cuenta = cuentas[0];
    if (cuenta.rol === 'admin') return { error: 'La cuenta de administración entra con mail y contraseña.' };
    if (cuenta.dni && cuenta.dni !== datos.dni) return { error: `El legajo ${legajo} ya está vinculado a otra cuenta de CiDiTuc. ${ESCRIBINOS}` };

    const { data: agente } = await db.from('agentes').select('nombre').eq('legajo', legajo).maybeSingle();
    if (!nombresCoinciden(datos, agente?.nombre ?? cuenta.nombre)) {
      return { error: `No pudimos confirmar que el legajo ${legajo} sea tuyo, porque no coincide con el nombre de tu cuenta CiDiTuc. Revisá el número; si está bien, escribí a ${MAIL_CH}.` };
    }

    const { error: e2 } = await db.from('usuarios').update({ dni: datos.dni }).eq('id', cuenta.id);
    if (e2) return { error: `No pudimos vincular tu cuenta. ${ESCRIBINOS}` };
    await db.from('auditoria').insert({ usuario_id: cuenta.id, accion: 'vincular_cidituc', detalle: { legajo } });
    await borrarCookie(COOKIE_VINCULAR, PATH_VINCULAR);
    await abrirSesion(cuenta.email);
  } catch (e) {
    console.error('cidituc: no se pudo vincular:', e instanceof Error ? e.message : e);
    return { error: 'El sistema no está disponible en este momento. Probá de nuevo más tarde.' };
  }
  redirect('/');
}
