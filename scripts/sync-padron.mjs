// Trae el padrón de agentes y el organigrama desde CapitalIA (API de solo lectura)
// y los guarda en data/cache/ (excluido de git: son datos personales).
//
// Uso:  node --env-file=.env.local scripts/sync-padron.mjs
//
// El token se lee del entorno (PADRON_API_TOKEN); nunca se escribe en el código.
// La API devuelve todo en una sola respuesta (~600 KB): alcanza con correrlo una vez por día.

import { mkdir, writeFile } from 'node:fs/promises';

const BASE = 'https://capital-ia-eight.vercel.app/api/padron';
const DESTINO = 'data/cache';

const token = process.env.PADRON_API_TOKEN;
if (!token) {
  console.error('Falta PADRON_API_TOKEN. Corré el script con: node --env-file=.env.local scripts/sync-padron.mjs');
  process.exit(1);
}

async function traer(recurso) {
  const url = recurso ? `${BASE}?recurso=${recurso}` : BASE;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${recurso ?? 'agentes'}: la API respondió ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json.datos) || json.total !== json.datos.length) {
    throw new Error(`${recurso ?? 'agentes'}: la API informa ${json.total} registros pero llegaron ${json.datos?.length}`);
  }
  return json;
}

const [agentes, reparticiones] = await Promise.all([traer(), traer('reparticiones')]);

await mkdir(DESTINO, { recursive: true });
await writeFile(`${DESTINO}/agentes.json`, JSON.stringify(agentes));
await writeFile(`${DESTINO}/reparticiones.json`, JSON.stringify(reparticiones));

console.log(`Padrón sincronizado (${agentes.generado}): ${agentes.total} agentes, ${reparticiones.total} reparticiones.`);
