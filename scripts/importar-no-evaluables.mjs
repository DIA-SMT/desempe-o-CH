// Carga la lista de personas que no se evalúan (tabla no_evaluables), a partir del Excel que pasa
// Capital Humano. Reemplaza la lista anterior del mismo motivo.
//
// Uso:  npm run padron:no-evaluables -- "data/historico/nomina funcionarios.xlsx"                       funcionarios
//       npm run padron:no-evaluables -- "data/historico/convenio 5.xlsx" --motivo convenio            convenio 5
//       (agregá --revisar para ver el resumen sin escribir nada)
//
// De la primera hoja lee las columnas Legajo y, si están, Apellido y Nombre, FUNCION, CUIL, Conv y la
// repartición (la de prestación de servicios si viene; si no, REPARTICION).
// Con --motivo convenio y una columna Conv, toma solo las filas de convenio 5.
// La repartición de la nómina se cruza por nombre con CapitalIA (y data/equivalencias-reparticiones.csv):
// así se sabe de qué unidad es titular cada director, secretario o subsecretario. Con el CUIL se guarda
// el DNI, y se completa en las cuentas del sistema que tengan ese legajo y todavía no lo tengan.
// El Excel tiene datos personales: guardalo en data/historico/, que está fuera de git.

import { readFile } from 'node:fs/promises';
import pg from 'pg';
import readExcelFile from 'read-excel-file/node';

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith('--'));
const motivo = args.includes('--motivo') ? args[args.indexOf('--motivo') + 1] : 'funcionario';
const revisar = args.includes('--revisar');
if (!archivo || !['funcionario', 'convenio'].includes(motivo)) {
  console.error('Uso: npm run padron:no-evaluables -- "archivo.xlsx" [--motivo funcionario|convenio] [--revisar]');
  process.exit(1);
}

const norm = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const limpio = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const leer = async (f) => JSON.parse(await readFile(f, 'utf8')).datos;
const unidades = await leer('data/cache/reparticiones.json');
const agentes = new Map((await leer('data/cache/agentes.json')).map((a) => [a.legajo, a]));
const porNombre = new Map(unidades.map((u) => [norm(u.nombre), u.codigo]));
const equivalencias = (await readFile('data/equivalencias-reparticiones.csv', 'utf8')).replace(/^﻿/, '')
  .split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(';'));
for (const [nombre, codigo] of equivalencias) if (codigo) porNombre.set(norm(nombre), codigo);

const [{ data }] = await readExcelFile(archivo);
const [enc, ...filas] = data.filter((f) => f.some((v) => v != null && v !== ''));
const col = (re) => enc.findIndex((h) => re.test(norm(h)));
const primera = (...res) => res.map(col).find((i) => i >= 0) ?? -1;
const c = {
  legajo: col(/^LEGAJO/), nombre: col(/APELLIDO/), funcion: col(/^FUNCION$/), conv: col(/^CONV/), cuil: primera(/^CUIL$/, /^DNI$/),
  reparticion: primera(/^REPARTICION PRESTACION/, /^REPARTICION$/, /^REPARTICION/),
};
// CUIL (11 dígitos: prefijo, DNI de 8 y verificador) o DNI suelto → DNI sin ceros adelante
const dniDe = (v) => {
  const d = String(v ?? '').replace(/\D/g, '');
  const dni = (d.length === 11 ? d.slice(2, 10) : d.length >= 6 && d.length <= 8 ? d : '').replace(/^0+/, '');
  return dni.length >= 6 ? dni : null;
};
if (c.legajo < 0) {
  console.error('El archivo no tiene una columna "Legajo".');
  process.exit(1);
}

const registros = [];
let descartadas = 0;
for (const f of filas) {
  if (motivo === 'convenio' && c.conv >= 0 && String(f[c.conv]).trim() !== '5') continue;
  const legajo = String(f[c.legajo] ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (!legajo) { descartadas++; continue; }
  const reparticion = c.reparticion >= 0 ? limpio(f[c.reparticion]) : null;
  const agente = agentes.get(legajo);
  registros.push({
    legajo,
    nombre: c.nombre >= 0 ? limpio(f[c.nombre]) : agente?.nombre ?? '',
    motivo,
    funcion: c.funcion >= 0 ? limpio(f[c.funcion]).toUpperCase() || null : null,
    dni: c.cuil >= 0 ? dniDe(f[c.cuil]) : null,
    reparticion,
    // La unidad de la nómina; si no se puede cruzar, la del padrón
    unidad_codigo: (reparticion && porNombre.get(norm(reparticion))) || agente?.reparticionCodigo || null,
  });
}
const unicos = [...new Map(registros.map((r) => [r.legajo, r])).values()];
const sinPadron = unicos.filter((r) => !agentes.has(r.legajo)).length;
const sinCruce = [...new Set(unicos.filter((r) => r.reparticion && !porNombre.get(norm(r.reparticion))).map((r) => r.reparticion))];
console.log(`${unicos.length} personas (${motivo}); ${sinPadron} no están en el padrón; ${descartadas} filas sin legajo.`);
if (sinCruce.length) console.log(`Reparticiones sin cruzar con CapitalIA (se usa la unidad del padrón): ${sinCruce.join('; ')}`);
if (revisar) process.exit(0);

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Falta SUPABASE_DB_URL en .env.local (Supabase > Connect > Session pooler).');
  process.exit(1);
}
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query('begin');
  await db.query('delete from no_evaluables where motivo = $1', [motivo]);
  await db.query(
    `insert into no_evaluables (legajo, nombre, motivo, funcion, dni, reparticion, unidad_codigo)
     select legajo, nombre, motivo, funcion, dni, reparticion, unidad_codigo
     from json_to_recordset($1) as x(legajo text, nombre text, motivo text, funcion text, dni text, reparticion text, unidad_codigo text)
     on conflict (legajo) do update set motivo = excluded.motivo, funcion = excluded.funcion, dni = excluded.dni,
       reparticion = excluded.reparticion, unidad_codigo = excluded.unidad_codigo, cargado_en = now()`,
    [JSON.stringify(unicos)]);
  // El DNI también va a las cuentas del sistema con ese legajo (así entran con CiDiTuc directo)
  const { rowCount } = await db.query(`
    update usuarios u set dni = n.dni from no_evaluables n
    where n.legajo = u.legajo and u.dni is null and n.dni is not null and u.rol <> 'admin'
      and not exists (select 1 from usuarios x where x.dni = n.dni)`);
  await db.query('commit');
  if (rowCount) console.log(`DNI completado en ${rowCount} cuentas del sistema.`);
  console.log('Cargado. Para que salgan de la foto del período abierto: Configuración → Actualizar foto del padrón.');
} catch (e) {
  await db.query('rollback');
  console.error('No se cargó nada:', e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
