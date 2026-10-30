import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';

// Destino del enlace que llega por mail. Acepta el formato con token_hash
// (plantilla de mail recomendada) y el formato con code (plantilla por defecto).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const tipo = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');

  const supabase = await clienteServidor();
  let ok = false;
  if (tokenHash && tipo) {
    ok = !(await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  return NextResponse.redirect(`${origin}${ok ? '/' : '/ingresar?error=enlace'}`);
}
