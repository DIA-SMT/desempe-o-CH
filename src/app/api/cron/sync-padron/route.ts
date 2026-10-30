import { NextResponse, type NextRequest } from 'next/server';
import { sincronizarPadron } from '@/lib/padron';

// Lo llama Vercel Cron una vez por día (ver vercel.json) con la cabecera Authorization: Bearer CRON_SECRET.
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
