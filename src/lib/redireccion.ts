import { NextResponse } from 'next/server';

// Redirección dentro del mismo sitio con la dirección relativa ("/ingresar"): el navegador la completa con la
// que tiene en la barra. En el servidor (next start -H 127.0.0.1 detrás de nginx) request.url de las rutas
// es http(s)://localhost:3012/…, así que no sirve para armar la dirección absoluta.
export function redirigirAca(ruta: string, status: 303 | 307 = 307) {
  return new NextResponse(null, { status, headers: { Location: ruta } });
}
