import { NextResponse, type NextRequest } from 'next/server';
import { leerConfig, nuevoState, urlDeIngreso } from '@/lib/cidituc';
import { COOKIE_STATE, PATH_STATE, guardarCookie } from '@/lib/ingreso-cidituc';

// "Ingresar con CiDiTuc": state nuevo (de un solo uso) y a Ciudad Digital
export async function GET(request: NextRequest) {
  const config = leerConfig();
  if (!config) return NextResponse.redirect(new URL('/ingresar?error=cidituc-config', request.url));
  const state = nuevoState();
  await guardarCookie(COOKIE_STATE, state, PATH_STATE);
  const res = NextResponse.redirect(urlDeIngreso(config, state));
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
