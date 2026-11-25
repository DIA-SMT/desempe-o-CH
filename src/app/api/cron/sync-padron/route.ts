import { NextResponse, type NextRequest } from 'next/server';
import { sincronizarPadron } from '@/lib/padron';

// Lo llama una vez por día, con la cabecera Authorization: Bearer CRON_SECRET, el cron del servidor
// (/etc/cron.d/padron-evaluador → /usr/local/bin/padron-evaluador.sh, 6:00) o Vercel Cron (vercel.json).
// En el servidor nginx no la deja pasar desde afuera: se llama directo a 127.0.0.1:3012.
export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    return NextResponse.json(await sincronizarPadron());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export const maxDuration = 60;
