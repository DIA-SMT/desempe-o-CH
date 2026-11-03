// Importa las evaluaciones de años anteriores (planilla del Google Forms de Capital Humano,
// una hoja por semestre) como períodos históricos cerrados, para compararlas en el tablero.
//
// Uso:  npm run historico:importar -- "data/historico/archivo.xlsx"            revisa y muestra el resumen
//       npm run historico:importar -- "data/historico/archivo.xlsx" --cargar   además lo escribe en la base
//
// Si ya hay un período histórico con el nombre de la hoja, se reemplaza.
// Criterios:
// - Si una persona aparece más de una vez en la hoja, vale la última respuesta.
// - La repartición se cruza por nombre con CapitalIA o con data/equivalencias-reparticiones.csv;
//   si no hay equivalencia, se usa la unidad actual del agente.
// Necesita data/cache (npm run padron:sync) y SUPABASE_DB_URL. El Excel tiene datos personales:
// guardalo en data/historico/, que está fuera de git.

import { readFile } from 'node:fs/promises';
import pg from 'pg';
import readExcelFile from 'read-excel-file/node';
import { COMPETENCIAS_BASE } from '../src/lib/competencias.ts';

const [archivo, opcion] = process.argv.slice(2);
if (!archivo) {
  console.error('Uso: npm run historico:importar -- "data/historico/archivo.xlsx" [--cargar]');
  process.exit(1);
}
const cargar = opcion === '--cargar';

const leer = async (f) => JSON.parse(await readFile(f, 'utf8')).datos;
const unidades = await leer('data/cache/reparticiones.json');
const agentes = new Map((await leer('data/cache/agentes.json')).map((a) => [a.legajo, a]));

const norm = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const limpio = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const legajo = (v) => String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');

// Unidad de CapitalIA para cada nombre de repartición escrito en el formulario
const porCodigo = new Map(unidades.map((u) => [u.codigo, u]));
const porNombre = new Map(unidades.map((u) => [norm(u.nombre), u.codigo]));
const equivalencias = (await readFile('data/equivalencias-reparticiones.csv', 'utf8')).replace(/^﻿/, '')
  .split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(';'));
for (const [nombre, codigo] of equivalencias) porNombre.set(norm(nombre), codigo || null);

// Secretaría de cada unidad, con el mismo texto que usa el padrón
const conteo = new Map();
for (const a of agentes.values()) {
  const c = conteo.get(a.reparticionCodigo) ?? new Map();
  c.set(a.secretaria, (c.get(a.secretaria) ?? 0) + 1);
  conteo.set(a.reparticionCodigo, c);
}
function secretariaDe(codigo) {
  for (let u = porCodigo.get(codigo); u; u = porCodigo.get(u.dependeDe)) {
    const c = conteo.get(u.codigo);
    if (c) return [...c.entries()].sort((x, y) => y[1] - x[1])[0][0];
    if (u.tipo === 'secretaria') return u.nombre;
  }
  return null;
}

// "Marca temporal" del formulario, en hora de Argentina
function fechaHora(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 19) + '-03:00';
  const m = String(v ?? '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):?(\d{2})?/);
  if (!m) return null;
  const [, d, mes, a, h, min, s = '00'] = m;
  return `${a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${min}:${s}-03:00`;
}

const COLUMNAS = { fecha: 0, evaluadorNombre: 1, evaluadorLegajo: 2, reparticion: 3, nombre: 4, legajo: 5, funcion: 6, puntajes: 7 };
const N = COMPETENCIAS_BASE.length;

const hojas = [];
for (const { sheet, data } of await readExcelFile(archivo)) {
  const [enc, ...filas] = data.filter((f) => f.some((v) => v != null && v !== ''));
  const esperadas = COMPETENCIAS_BASE.map((c) => norm(c.nombre));
  const halladas = enc.slice(COLUMNAS.puntajes, COLUMNAS.puntajes + N).map(norm);
  if (halladas.join('|') !== esperadas.join('|')) {
    console.error(`La hoja "${sheet}" no tiene las ${N} competencias en el orden del formulario:\n  ${halladas.join('\n  ')}`);
    process.exit(1);
  }

  const porLegajo = new Map();
  let descartadas = 0;
  for (const f of filas) {
    const puntajes = f.slice(COLUMNAS.puntajes, COLUMNAS.puntajes + N).map(Number);
    const leg = legajo(f[COLUMNAS.legajo]);
    const fecha = fechaHora(f[COLUMNAS.fecha]);
    if (!leg || !fecha || puntajes.some((p) => !Number.isInteger(p) || p < 1 || p > 10)) { descartadas++; continue; }
    const previa = porLegajo.get(leg);
    if (previa && previa.fecha > fecha) continue; // vale la última respuesta
    porLegajo.set(leg, { f, leg, fecha, puntajes });
  }

  const origen = { reparticion: 0, unidadActual: 0, sinUnidad: 0 };
  const registros = [...porLegajo.values()].map(({ f, leg, fecha, puntajes }) => {
    const agente = agentes.get(leg);
    let codigo = porNombre.get(norm(f[COLUMNAS.reparticion]));
    if (codigo) origen.reparticion++;
    else if (agente) { codigo = agente.reparticionCodigo; origen.unidadActual++; }
    else origen.sinUnidad++;
    const u = codigo ? porCodigo.get(codigo) : null;
    return {
      legajo: leg,
      nombre: agente?.nombre ?? limpio(f[COLUMNAS.nombre]).toUpperCase(),
      unidad_codigo: codigo ?? '',
      unidad_nombre: u?.nombre ?? (limpio(f[COLUMNAS.reparticion]) || 'Sin identificar'),
      secretaria: codigo ? secretariaDe(codigo) : null,
      puntajes: `{${puntajes.join(',')}}`,
      enviada_en: fecha,
      evaluador_legajo: legajo(f[COLUMNAS.evaluadorLegajo]) || null,
      evaluador_nombre: limpio(f[COLUMNAS.evaluadorNombre]) || null,
      funcion: limpio(f[COLUMNAS.funcion]) || null,
    };
  });

  const fechas = registros.map((r) => r.enviada_en.slice(0, 10)).sort();
  hojas.push({ nombre: limpio(sheet), inicio: fechas[0], cierre: fechas.at(-1), registros });
  console.log(`${sheet}: ${registros.length} evaluaciones (${fechas[0]} a ${fechas.at(-1)})`);
  console.log(`  ${filas.length - descartadas - registros.length} repetidas (quedó la última), ${descartadas} descartadas por datos incompletos`);
  console.log(`  unidad por repartición ${origen.reparticion}, por unidad actual del agente ${origen.unidadActual}, sin identificar ${origen.sinUnidad}`);
}

if (!cargar) {
  console.log('\nNo se escribió nada. Para cargarlo en la base, repetí el comando con --cargar.');
  process.exit(0);
}

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Falta SUPABASE_DB_URL en .env.local (Supabase > Connect > Session pooler).');
  process.exit(1);
}
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query('begin');
  for (const h of hojas) {
    const { rows: existentes } = await db.query('select id, historico from periodos where nombre = $1', [h.nombre]);
    if (existentes.some((p) => !p.historico)) throw new Error(`Ya existe un período "${h.nombre}" que no es histórico`);
    const ids = existentes.map((p) => p.id);
    await db.query('delete from evaluaciones where periodo_id = any($1)', [ids]);
    await db.query('delete from periodos where id = any($1)', [ids]);

    const { rows: [{ id }] } = await db.query(
      `insert into periodos (nombre, inicio, cierre, estado, historico) values ($1, $2, $3, 'cerrado', true) returning id`,
      [h.nombre, h.inicio, h.cierre]);
    await db.query(
      `insert into competencias (periodo_id, orden, tipo, nombre, descripcion)
       select $1, orden, tipo, nombre, descripcion from json_to_recordset($2) as x(orden int, tipo text, nombre text, descripcion text)`,
      [id, JSON.stringify(COMPETENCIAS_BASE)]);
    await db.query(
      `insert into padron_periodo (periodo_id, legajo, nombre, unidad_codigo, unidad_nombre, secretaria)
       select $1, legajo, nombre, unidad_codigo, unidad_nombre, secretaria
       from json_to_recordset($2) as x(legajo text, nombre text, unidad_codigo text, unidad_nombre text, secretaria text)`,
      [id, JSON.stringify(h.registros)]);
    await db.query(
      `insert into evaluaciones (periodo_id, legajo, puntajes, estado, enviada_en, evaluador_legajo, evaluador_nombre, funcion)
       select $1, legajo, puntajes::smallint[], 'enviada', enviada_en, evaluador_legajo, evaluador_nombre, funcion
       from json_to_recordset($2) as x(legajo text, puntajes text, enviada_en timestamptz, evaluador_legajo text, evaluador_nombre text, funcion text)`,
      [id, JSON.stringify(h.registros)]);
    console.log(`Cargado "${h.nombre}" (período ${id})`);
  }
  await db.query('commit');
} catch (e) {
  await db.query('rollback');
  console.error('No se cargó nada:', e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
