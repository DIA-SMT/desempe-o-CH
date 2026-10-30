// Da de alta (o actualiza) un usuario de Capital Humano. Sirve para crear el primer
// administrador; después, la Dirección de CH gestiona usuarios desde Configuración.
//
// Uso:  npm run usuario:crear -- <mail> "<Apellido y nombre>" <rol> [--encargado]
//   rol: admin | directora_ch | capital_humano
//   --encargado: un usuario capital_humano que puede ver los puntajes individuales

import { createClient } from '@supabase/supabase-js';

const [email, nombre, rol = 'admin', ...resto] = process.argv.slice(2);
const ROLES = ['admin', 'directora_ch', 'capital_humano'];

if (!email || !nombre || !ROLES.includes(rol)) {
  console.error('Uso: npm run usuario:crear -- <mail> "<Apellido y nombre>" <admin|directora_ch|capital_humano> [--encargado]');
  process.exit(1);
}
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: clave } = process.env;
if (!url || !clave) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const db = createClient(url, clave, { auth: { persistSession: false } });
const { error } = await db.from('usuarios').upsert(
  { email: email.toLowerCase(), nombre, rol, ve_respuestas: rol === 'capital_humano' && resto.includes('--encargado'), activo: true },
  { onConflict: 'email' },
);
if (error) {
  console.error('No se pudo guardar:', error.message);
  process.exit(1);
}
console.log(`Listo: ${nombre} <${email.toLowerCase()}> con rol ${rol}. Ya puede pedir su enlace de ingreso.`);
