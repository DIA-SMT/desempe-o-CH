import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { DURACION_S, dniDeDocumento, firmar, leerConfig, mismoValor, validarToken, venceEn } from '@/lib/cidituc';
import { redirigirAca } from '@/lib/redireccion';
import {
  COOKIE_PORTAL, COOKIE_STATE, COOKIE_VINCULAR, PATH_STATE, PATH_VINCULAR, abrirSesion, borrarCookie, cuentaPorDni,
  esLaSesionDe, guardarCookie,
} from '@/lib/ingreso-cidituc';

// La vuelta de Ciudad Digital: /auth/cidituc/callback?auth=<JWT>&state=…
// Sin state es la entrada desde el portal cidituc.smt.gob.ar (el proxy manda acá cualquier ?auth=):
// el token se valida igual, pero la sesión se abre recién cuando la persona confirma quién es.
export async function GET(request: NextRequest) {
  const ir = (destino: string) => {
    const res = redirigirAca(destino);
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('Referrer-Policy', 'no-referrer'); // que la dirección con el token no se filtre
    return res;
  };
  const error = (codigo: string) => ir(`/ingresar?error=cidituc-${codigo}`);

  const params = request.nextUrl.searchParams;
  const desdePortal = !params.has('state');
  if (!desdePortal) {
    // El state es de un solo uso: se borra pase lo que pase
    const guardado = (await cookies()).get(COOKIE_STATE)?.value;
    await borrarCookie(COOKIE_STATE, PATH_STATE);
    if (!mismoValor(params.get('state') ?? '', guardado)) return error('estado');
  }
  const config = leerConfig();
  if (!config) return error('config');

  const token = params.get('auth') ?? '';
  if (!token) return error('token');

  const v = await validarToken(config, token);
  if (!v.ok) return error(v.motivo === 'red' ? 'validacion' : 'token');
  const dni = dniDeDocumento(v.persona.documento);
  if (!dni) return error('token');
  const datos = { dni, nombre: v.persona.nombre, apellido: v.persona.apellido, exp: venceEn(DURACION_S) };

  try {
    const cuenta = await cuentaPorDni(dni);
    if (!cuenta) {
      // Primer ingreso: se vincula con el legajo (ver /ingresar/cidituc)
      await guardarCookie(COOKIE_VINCULAR, firmar(datos, config.secreto), PATH_VINCULAR);
      return ir('/ingresar/cidituc');
    }
    if (!cuenta.activo) return ir('/ingresar?error=no-habilitado');
    if (cuenta.rol === 'admin') return error('admin');
    if (desdePortal) {
      // Si ya tiene la sesión abierta con esta cuenta, sigue de largo; si no, confirma su nombre
      if (await esLaSesionDe(cuenta.email)) return ir('/');
      await guardarCookie(COOKIE_PORTAL, firmar(datos, config.secreto), PATH_VINCULAR);
      return ir('/ingresar/cidituc/confirmar');
    }
    await abrirSesion(cuenta.email);
    console.log(`cidituc: ingreso de ${cuenta.rol} (DNI …${dni.slice(-3)})`);
    return ir('/');
  } catch (e) {
    console.error('cidituc: no se pudo abrir la sesión:', e instanceof Error ? e.message : e);
    return error('servidor');
  }
}
