import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { DURACION_S, dniDeDocumento, firmar, leerConfig, mismoValor, validarToken, venceEn } from '@/lib/cidituc';
import {
  COOKIE_STATE, COOKIE_VINCULAR, PATH_STATE, PATH_VINCULAR, abrirSesion, borrarCookie, cuentaPorDni, guardarCookie,
} from '@/lib/ingreso-cidituc';

// La vuelta de Ciudad Digital: /auth/cidituc/callback?auth=<JWT>&state=…
export async function GET(request: NextRequest) {
  const ir = (destino: string) => {
    const res = NextResponse.redirect(new URL(destino, request.url));
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('Referrer-Policy', 'no-referrer'); // que la dirección con el token no se filtre
    return res;
  };
  const error = (codigo: string) => ir(`/ingresar?error=cidituc-${codigo}`);

  // El state es de un solo uso: se borra pase lo que pase
  const guardado = (await cookies()).get(COOKIE_STATE)?.value;
  await borrarCookie(COOKIE_STATE, PATH_STATE);
  const config = leerConfig();
  if (!config) return error('config');

  const token = request.nextUrl.searchParams.get('auth') ?? '';
  if (!mismoValor(request.nextUrl.searchParams.get('state') ?? '', guardado)) return error('estado');
  if (!token) return error('token');

  const v = await validarToken(config, token);
  if (!v.ok) return error(v.motivo === 'red' ? 'validacion' : 'token');
  const dni = dniDeDocumento(v.persona.documento);
  if (!dni) return error('token');

  try {
    const cuenta = await cuentaPorDni(dni);
    if (!cuenta) {
      // Primer ingreso: se vincula con el legajo (ver /ingresar/cidituc)
      const datos = { dni, nombre: v.persona.nombre, apellido: v.persona.apellido, exp: venceEn(DURACION_S) };
      await guardarCookie(COOKIE_VINCULAR, firmar(datos, config.secreto), PATH_VINCULAR);
      return ir('/ingresar/cidituc');
    }
    if (!cuenta.activo) return ir('/ingresar?error=no-habilitado');
    if (cuenta.rol === 'admin') return error('admin');
    await abrirSesion(cuenta.email);
    console.log(`cidituc: ingreso de ${cuenta.rol} (DNI …${dni.slice(-3)})`);
    return ir('/');
  } catch (e) {
    console.error('cidituc: no se pudo abrir la sesión:', e instanceof Error ? e.message : e);
    return error('servidor');
  }
}
