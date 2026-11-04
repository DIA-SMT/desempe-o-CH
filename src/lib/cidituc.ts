// Ingreso con CiDiTuc (la cuenta ciudadana de la Municipalidad), por Ciudad Digital.
//
// El contrato (repo ditec-desarrollo/cidituc, src/routes/PrivateRoute.jsx):
//   1. /auth/cidituc/login guarda un `state` al azar en una cookie corta y manda a la persona a
//      <CIDITUC_LOGIN_URL>/#/login?next=<clave>&state=… (el # es obligatorio: Ciudad Digital usa
//      rutas con #, y sin él su pantalla de ingreso no ve el next).
//   2. Ciudad Digital pide CUIL y clave y vuelve a /auth/cidituc/callback?auth=<JWT>&state=…
//      Para esta app pide la clave en cada ingreso y no deja la sesión guardada en el navegador.
//   3. El callback compara el state, valida el JWT contra <CIDITUC_BACKEND_URL>/usuarios/authStatus
//      (Authorization: el token crudo, sin "Bearer") y busca al usuario por DNI.
// El JWT se valida y se descarta: no llega al navegador ni queda guardado.
//
// Solo usa módulos de Node (sin alias ni funciones de Next), para probarlo con node --test.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { rootCertificates } from 'node:tls';

export interface ConfigCidituc {
  loginUrl: string;
  backendUrl: string;
  nextKey: string;
  secreto: string;  // firma la cookie de vinculación
  caExtra?: string; // certificados que le falten a la cadena TLS del backend municipal (PEM)
}

// Sin configurar no hay ingreso con CiDiTuc (nunca "abierto por las dudas")
export function leerConfig(env: NodeJS.ProcessEnv = process.env): ConfigCidituc | null {
  const loginUrl = env.CIDITUC_LOGIN_URL?.replace(/[/#]+$/, '');
  const backendUrl = env.CIDITUC_BACKEND_URL?.replace(/\/+$/, '');
  const nextKey = env.CIDITUC_NEXT_KEY;
  const secreto = env.CIDITUC_SESSION_SECRET;
  if (!loginUrl || !backendUrl || !nextKey || !secreto || secreto.length < 32) return null;
  const pem = env.CIDITUC_CA_PEM?.replace(/\\n/g, '\n');
  return { loginUrl, backendUrl, nextKey, secreto, caExtra: pem?.includes('BEGIN CERTIFICATE') ? pem : undefined };
}

// Quien entra solo con CiDiTuc puede no tener mail cargado; la sesión de Supabase igual necesita uno.
// El dominio .invalid está reservado: ningún mail sale ni llega ahí.
const SIN_MAIL = '@sin-mail.invalid';
export const mailSinMail = (legajo: string) => `legajo-${legajo}${SIN_MAIL}`;
export const esSinMail = (email: string | null | undefined) => !!email?.endsWith(SIN_MAIL);

export const COOKIE_STATE = 'cidituc_state';
export const COOKIE_VINCULAR = 'cidituc_vincular';
export const DURACION_S = 10 * 60;

export const nuevoState = () => randomBytes(32).toString('base64url');

export const urlDeIngreso = (config: ConfigCidituc, state: string) =>
  `${config.loginUrl}/#/login?next=${encodeURIComponent(config.nextKey)}&state=${encodeURIComponent(state)}`;

// Comparación en tiempo constante: que el tiempo de respuesta no delate el valor guardado
export function mismoValor(a: string | undefined, b: string | undefined): boolean {
  const x = Buffer.from(a ?? ''), y = Buffer.from(b ?? '');
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

// El documento de CiDiTuc es el CUIL (11 dígitos: prefijo, DNI de 8 con ceros adelante y
// verificador). Acá se guarda el DNI sin ceros adelante. Acepta también un DNI suelto.
export function dniDeDocumento(documento: unknown): string | null {
  const d = String(documento ?? '').replace(/\D/g, '');
  const dni = (d.length === 11 ? d.slice(2, 10) : d.length >= 6 && d.length <= 8 ? d : '').replace(/^0+/, '');
  return dni.length >= 6 && dni.length <= 8 ? dni : null;
}

// Cookies firmadas (HMAC-SHA256): no se pueden inventar ni retocar. `exp` en segundos.
export function firmar(datos: object, secreto: string): string {
  const cuerpo = Buffer.from(JSON.stringify(datos)).toString('base64url');
  return `${cuerpo}.${createHmac('sha256', secreto).update(cuerpo).digest('base64url')}`;
}

export function verificar<T extends { exp: number }>(valor: string | undefined, secreto: string): T | null {
  const [cuerpo, firma, sobra] = (valor ?? '').split('.');
  if (!cuerpo || !firma || sobra !== undefined) return null;
  if (!mismoValor(firma, createHmac('sha256', secreto).update(cuerpo).digest('base64url'))) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as T;
    return typeof datos.exp === 'number' && datos.exp * 1000 > Date.now() ? datos : null;
  } catch {
    return null;
  }
}

export const venceEn = (segundos: number) => Math.floor(Date.now() / 1000) + segundos;

export interface PersonaCidituc { documento: string; nombre: string; apellido: string }

export type Validacion = { ok: true; persona: PersonaCidituc } | { ok: false; motivo: 'token' | 'red' };

// Pregunta al backend municipal de quién es el token. La verificación TLS nunca se apaga:
// si a la cadena le faltara un certificado, se agrega con CIDITUC_CA_PEM.
export function validarToken(config: ConfigCidituc, token: string): Promise<Validacion> {
  const url = new URL(`${config.backendUrl}/usuarios/authStatus`);
  const https = url.protocol === 'https:';
  return new Promise((resolve) => {
    const pedido = (https ? httpsRequest : httpRequest)(url, {
      method: 'GET',
      headers: { Authorization: token, Accept: 'application/json' },
      timeout: 10_000,
      ...(https && config.caExtra ? { ca: [...rootCertificates, config.caExtra] } : {}),
    }, (res) => {
      const partes: Buffer[] = [];
      res.on('data', (c: Buffer) => partes.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve({ ok: false, motivo: 'token' });
        try {
          const cuerpo = JSON.parse(Buffer.concat(partes).toString('utf8'));
          const p = cuerpo?.usuarioSinContraseña ?? cuerpo?.data?.usuarioSinContraseña ?? cuerpo?.user?.usuarioSinContraseña;
          const documento = p?.documento_persona ?? p?.cuil ?? p?.dni;
          if (!p || !documento) return resolve({ ok: false, motivo: 'token' });
          resolve({
            ok: true,
            persona: { documento: String(documento), nombre: String(p.nombre_persona ?? ''), apellido: String(p.apellido_persona ?? '') },
          });
        } catch {
          resolve({ ok: false, motivo: 'token' });
        }
      });
    });
    pedido.on('timeout', () => pedido.destroy(new Error('timeout')));
    // Falla de red o de certificado: no es culpa de la persona
    pedido.on('error', () => resolve({ ok: false, motivo: 'red' }));
    pedido.end();
  });
}

// ¿El nombre verificado por CiDiTuc es el del legajo? El padrón escribe "APELLIDO NOMBRE" y puede
// tener menos nombres que CiDiTuc: tienen que estar todos los apellidos y al menos un nombre.
const PARTICULAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y']);
const palabras = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]+/g, ' ').trim().split(' ')
    .filter((p) => p.length > 1 && !PARTICULAS.has(p));

export function nombresCoinciden(persona: { nombre: string; apellido: string }, nombrePadron: string): boolean {
  const padron = new Set(palabras(nombrePadron));
  const apellidos = palabras(persona.apellido), nombres = palabras(persona.nombre);
  if (!apellidos.length || !nombres.length) return false;
  return apellidos.every((p) => padron.has(p)) && nombres.some((p) => padron.has(p));
}
