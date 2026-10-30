// Aplica en orden las migraciones de supabase/migrations que todavía no corrieron.
// Lleva el registro en la tabla _migraciones.
//
// Uso:  npm run db:migrar
// Necesita SUPABASE_DB_URL en .env.local (Supabase > Connect > Session pooler, con la contraseña de la base).

import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Falta SUPABASE_DB_URL en .env.local (Supabase > Connect > Session pooler).');
  process.exit(1);
}

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query('create table if not exists _migraciones (nombre text primary key, aplicada_en timestamptz not null default now())');
await db.query('alter table _migraciones enable row level security'); // no se expone por la API

const hechas = new Set((await db.query('select nombre from _migraciones')).rows.map((r) => r.nombre));
const archivos = (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();

let aplicadas = 0;
for (const f of archivos) {
  if (hechas.has(f)) continue;
  const sql = await readFile(`supabase/migrations/${f}`, 'utf8');
  try {
    await db.query('begin');
    await db.query(sql);
    await db.query('insert into _migraciones (nombre) values ($1)', [f]);
    await db.query('commit');
    console.log(`Aplicada ${f}`);
    aplicadas++;
  } catch (e) {
    await db.query('rollback');
    console.error(`Falló ${f}: ${e.message}`);
    await db.end();
    process.exit(1);
  }
}
console.log(aplicadas ? `${aplicadas} migraciones aplicadas.` : 'La base ya estaba al día.');
await db.end();
