import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// La dirección oficial es evaluador.smt.gob.ar. La de Vercel manda ahí con la misma ruta y los mismos parámetros:
// así siguen andando los links viejos y la vuelta de Ciudad Digital (?auth=…&state=…), que tiene que llegar al
// dominio donde quedó guardada la cookie del ingreso. Las tareas programadas (/api/cron) no pasan por acá.
const DOMINIO = 'evaluador.smt.gob.ar';
const DOMINIO_VERCEL = 'desempe-o-ch.vercel.app';

// Refresca la sesión en cada pedido y manda a /ingresar a quien no inició sesión.
export async function proxy(request: NextRequest) {
  if (request.headers.get('host') === DOMINIO_VERCEL) {
    const url = request.nextUrl.clone();
    url.protocol = 'https:';
    url.host = DOMINIO;
    url.port = '';
    return NextResponse.redirect(url, 308);
  }

  // Si Supabase manda el enlace a la raíz (dirección no permitida en Redirect URLs), lo reenviamos
  const code = request.nextUrl.searchParams.get('code');
  if (code && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/confirm';
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const publica = request.nextUrl.pathname.startsWith('/ingresar') || request.nextUrl.pathname.startsWith('/auth');
  if (!user && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = '/ingresar';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|api/cron|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)'],
};
