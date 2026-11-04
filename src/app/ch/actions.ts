'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { dniDeDocumento, mailSinMail } from '@/lib/cidituc';
import { COMPETENCIAS_BASE } from '@/lib/competencias';
import { sincronizarPadron } from '@/lib/padron';
import { periodoActual } from '@/lib/periodos';
import { puedeGestionarUsuarios, requerirCH, type Rol } from '@/lib/sesion';
import { clienteAdmin } from '@/lib/supabase/admin';
import { clienteServidor } from '@/lib/supabase/servidor';

function volver(ruta: string, aviso: string): never {
  redirect(`${ruta}?aviso=${encodeURIComponent(aviso)}`);
}

// ---------- Solicitudes (con la sesión del usuario: la función verifica el rol) ----------
export async function resolverSolicitud(form: FormData) {
  await requerirCH();
  const id = Number(form.get('id'));
  const aprobar = form.get('aprobar') === '1';
  const supabase = await clienteServidor();
  const { error } = await supabase.rpc('resolver_solicitud', { p_id: id, p_aprobar: aprobar });
  revalidatePath('/ch', 'layout');
  volver('/ch/seguimiento', error ? `No se pudo resolver: ${error.message}` : aprobar ? 'Solicitud aprobada: el agente pasó al equipo del director.' : 'Solicitud rechazada.');
}

// ---------- Padrón ----------
export async function sincronizarAhora() {
  await requerirCH();
  let aviso: string;
  try {
    const r = await sincronizarPadron();
    aviso = `Padrón actualizado: ${r.agentes.toLocaleString('es-AR')} agentes y ${r.unidades} unidades.`;
  } catch (e) {
    aviso = `No se pudo sincronizar: ${(e as Error).message}`;
  }
  revalidatePath('/ch', 'layout');
  volver('/ch/configuracion', aviso);
}

// ---------- Períodos ----------
export async function crearPeriodo(form: FormData) {
  await requerirCH();
  const nombre = String(form.get('nombre') ?? '').trim();
  const inicio = String(form.get('inicio') ?? '');
  const cierre = String(form.get('cierre') ?? '');
  if (!nombre || !inicio || !cierre || cierre < inicio) volver('/ch/configuracion', 'Revisá el nombre y las fechas: el cierre tiene que ser posterior a la apertura.');

  const supabase = await clienteServidor();
  const { data: p, error } = await supabase.from('periodos').insert({ nombre, inicio, cierre }).select('id').single();
  if (error || !p) volver('/ch/configuracion', `No se pudo crear el período: ${error?.message}`);

  // Las competencias se copian del último período con competencias, o de las base
  const { data: ult } = await supabase.from('competencias').select('periodo_id').neq('periodo_id', p!.id).order('periodo_id', { ascending: false }).limit(1);
  let comps = COMPETENCIAS_BASE.map(({ orden, tipo, nombre, descripcion }) => ({ orden, tipo, nombre, descripcion }));
  if (ult?.[0]) {
    const { data } = await supabase.from('competencias').select('orden, tipo, nombre, descripcion').eq('periodo_id', ult[0].periodo_id).order('orden');
    if (data?.length) comps = data;
  }
  const { error: e2 } = await supabase.from('competencias').insert(comps.map((c) => ({ ...c, periodo_id: p!.id })));
  revalidatePath('/ch', 'layout');
  volver('/ch/configuracion', e2 ? `Período creado, pero fallaron las competencias: ${e2.message}` : `Período «${nombre}» creado. Cargá los evaluadores y abrilo.`);
}

export async function abrirPeriodo(form: FormData) {
  await requerirCH();
  const supabase = await clienteServidor();
  const { error } = await supabase.rpc('abrir_periodo', { p_periodo: Number(form.get('id')) });
  revalidatePath('/', 'layout');
  volver('/ch/configuracion', error ? `No se pudo abrir: ${error.message}` : 'Período abierto: los directores ya pueden evaluar.');
}

export async function actualizarFoto(form: FormData) {
  await requerirCH();
  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc('preparar_padron', { p_periodo: Number(form.get('id')) });
  const r = (data as { agentes: number; sin_evaluador: number }[] | null)?.[0];
  revalidatePath('/', 'layout');
  volver('/ch/configuracion', error ? `No se pudo actualizar: ${error.message}` : `Foto del padrón actualizada: ${r?.agentes} agentes, ${r?.sin_evaluador} sin evaluador.`);
}

export async function cerrarPeriodo(form: FormData) {
  await requerirCH();
  if (form.get('confirmar') !== 'CERRAR') volver('/ch/configuracion', 'Para cerrar el período escribí CERRAR en el campo de confirmación.');
  const supabase = await clienteServidor();
  const { error } = await supabase.from('periodos').update({ estado: 'cerrado' }).eq('id', Number(form.get('id')));
  revalidatePath('/', 'layout');
  volver('/ch/configuracion', error ? `No se pudo cerrar: ${error.message}` : 'Período cerrado. Ya no se pueden cargar ni modificar evaluaciones.');
}

// ---------- Evaluadores: importación de la planilla por unidad ----------
export interface ResultadoImportacion { asignadas: number; usuariosNuevos: number; errores: string[]; aviso?: string }

function leerCSV(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [], celda = '', comillas = false;
  const t = texto.replace(/^﻿/, '');
  const sep = (t.split(/\r?\n/)[0].match(/;/g)?.length ?? 0) >= (t.split(/\r?\n/)[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"' && t[i + 1] === '"') { celda += '"'; i++; }
      else if (ch === '"') comillas = false;
      else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(celda); celda = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += ch;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas.filter((f) => f.some((c) => c.trim()));
}

export async function importarEvaluadores(_: ResultadoImportacion | null, form: FormData): Promise<ResultadoImportacion> {
  await requerirCH();
  const archivo = form.get('archivo');
  if (!(archivo instanceof File) || !archivo.size) return { asignadas: 0, usuariosNuevos: 0, errores: ['Elegí el archivo CSV de la planilla de evaluadores.'] };

  const db = clienteAdmin();
  const periodo = await periodoActual(db);
  if (!periodo) return { asignadas: 0, usuariosNuevos: 0, errores: ['Primero creá el período de evaluación.'] };

  const filas = leerCSV(await archivo.text());
  const enc = filas[0].map((h) => h.trim().toLowerCase());
  const col = (re: RegExp) => enc.findIndex((h) => re.test(h));
  const cCodigo = col(/^c[oó]digo$/), cLegajo = col(/legajo del evaluador/), cNombre = col(/nombre del evaluador/), cMail = col(/mail/), cUnidad = col(/^unidad$/);
  const cDni = col(/\b(dni|cuil)\b/);
  if (cCodigo < 0 || (cMail < 0 && cLegajo < 0)) {
    return { asignadas: 0, usuariosNuevos: 0, errores: ['La planilla no tiene las columnas «Código» y «Legajo del evaluador». Usá la planilla generada por el sistema.'] };
  }

  const { data: unidades } = await db.from('unidades').select('codigo');
  const codigos = new Set((unidades ?? []).map((u) => u.codigo));
  const errores: string[] = [];
  let asignadas = 0, nuevos = 0;

  for (const [i, f] of filas.slice(1).entries()) {
    const n = i + 2;
    const codigo = f[cCodigo]?.trim(), legajo = cLegajo >= 0 ? f[cLegajo]?.replace(/\D/g, '') : '';
    const mailEscrito = cMail >= 0 ? f[cMail]?.trim().toLowerCase() : '';
    const documento = cDni >= 0 ? f[cDni]?.trim() : '';
    const unidad = cUnidad >= 0 ? f[cUnidad]?.trim() : codigo;
    if (!mailEscrito && !legajo) continue; // fila sin completar
    if (!codigo || !codigos.has(codigo)) { errores.push(`Fila ${n}: la unidad «${codigo}» no existe en el organigrama.`); continue; }
    if (mailEscrito && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mailEscrito)) { errores.push(`Fila ${n} (${unidad}): el mail no es válido.`); continue; }
    // Con CiDiTuc el mail es opcional: alcanza con el legajo (y el DNI, si se tiene)
    const mail = mailEscrito || mailSinMail(legajo!);
    const dni = documento ? dniDeDocumento(documento) : null;
    if (documento && !dni) { errores.push(`Fila ${n} (${unidad}): el DNI o CUIL no es válido.`); continue; }

    let nombre = cNombre >= 0 ? f[cNombre]?.trim() : '';
    if (legajo) {
      const { data: ag } = await db.from('agentes').select('nombre').eq('legajo', legajo).maybeSingle();
      if (!ag) { errores.push(`Fila ${n} (${unidad}): el legajo ${legajo} no está en el padrón.`); continue; }
      nombre = ag.nombre;
    }
    if (!nombre) { errores.push(`Fila ${n} (${unidad}): falta el legajo o el nombre del evaluador.`); continue; }

    // La misma persona: por mail o, si la fila no lo trae, por legajo
    const buscar = mailEscrito || !legajo
      ? db.from('usuarios').select('id').eq('email', mail)
      : db.from('usuarios').select('id').eq('legajo', legajo).order('creado_en').limit(1);
    const { data: existente } = await buscar.maybeSingle();
    let id = existente?.id as string | undefined;
    if (!id) {
      const { data: u, error } = await db.from('usuarios').insert({ email: mail, nombre, legajo: legajo || null, rol: 'evaluador', ...(dni && { dni }) }).select('id').single();
      if (error || !u) {
        errores.push(`Fila ${n} (${unidad}): ${error && /dni/.test(error.message) ? `el DNI ${dni} ya está cargado en otra cuenta` : `no se pudo dar de alta a ${nombre}`}.`);
        continue;
      }
      id = u.id; nuevos++;
    } else if (legajo || dni) {
      const { error } = await db.from('usuarios').update({ ...(legajo && { legajo }), ...(dni && { dni }), activo: true }).eq('id', id);
      if (error) errores.push(`Fila ${n} (${unidad}): ${/dni/.test(error.message) ? `el DNI ${dni} ya está cargado en otra cuenta` : error.message}.`);
    }
    const { error } = await db.from('asignaciones').upsert({ periodo_id: periodo.id, unidad_codigo: codigo, evaluador_id: id }, { onConflict: 'periodo_id,unidad_codigo' });
    if (error) errores.push(`Fila ${n} (${unidad}): ${error.message}`); else asignadas++;
  }

  let aviso: string | undefined;
  if (periodo.estado === 'abierto' && asignadas) {
    const supabase = await clienteServidor();
    const { data } = await supabase.rpc('preparar_padron', { p_periodo: periodo.id });
    const r = (data as { sin_evaluador: number }[] | null)?.[0];
    aviso = `Se actualizó la foto del padrón: quedan ${r?.sin_evaluador ?? '?'} agentes sin evaluador.`;
  }
  revalidatePath('/ch', 'layout');
  return { asignadas, usuariosNuevos: nuevos, errores, aviso };
}

// ---------- Usuarios de Capital Humano (solo directora y admin) ----------
export async function guardarUsuarioCH(form: FormData) {
  const yo = await requerirCH();
  if (!puedeGestionarUsuarios(yo)) volver('/ch/configuracion', 'Solo la Dirección de Capital Humano puede dar de alta usuarios.');
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const nombre = String(form.get('nombre') ?? '').trim();
  const rol = String(form.get('rol')) as Rol;
  const ve = form.get('ve_respuestas') === 'on';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !nombre) volver('/ch/configuracion', 'Completá un mail válido y el nombre.');
  if (!['capital_humano', 'directora_ch', 'admin'].includes(rol)) volver('/ch/configuracion', 'Rol no válido.');
  if (rol === 'admin' && yo.rol !== 'admin') volver('/ch/configuracion', 'Solo un administrador puede crear otro administrador.');
  // DNI opcional, para entrar con CiDiTuc (acepta también el CUIL)
  const documento = String(form.get('dni') ?? '').trim();
  const dni = documento ? dniDeDocumento(documento) : null;
  if (documento && !dni) volver('/ch/configuracion', 'El DNI o CUIL no es válido.');

  const { error } = await clienteAdmin().from('usuarios').upsert({
    email, nombre, rol, ve_respuestas: rol === 'capital_humano' ? ve : false, activo: true, ...(dni && { dni }),
  }, { onConflict: 'email' });
  revalidatePath('/ch/configuracion');
  volver('/ch/configuracion', error
    ? (/dni/.test(error.message) ? 'Ese DNI ya está cargado en otra cuenta.' : `No se pudo guardar: ${error.message}`)
    : `${nombre} ya puede ingresar con ${email}${dni ? ' o con CiDiTuc' : ''}.`);
}

export async function cambiarUsuario(form: FormData) {
  const yo = await requerirCH();
  if (!puedeGestionarUsuarios(yo)) volver('/ch/configuracion', 'Sin permiso.');
  const id = String(form.get('id'));
  if (id === yo.id) volver('/ch/configuracion', 'No podés modificar tu propio acceso.');
  const campo = String(form.get('campo'));
  const valor = form.get('valor') === '1';
  if (campo !== 'activo' && campo !== 've_respuestas') volver('/ch/configuracion', 'Cambio no válido.');
  await clienteAdmin().from('usuarios').update({ [campo]: valor }).eq('id', id);
  revalidatePath('/ch/configuracion');
  volver('/ch/configuracion', 'Usuario actualizado.');
}
