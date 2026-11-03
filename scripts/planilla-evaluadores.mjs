// Arma la planilla de unidades de evaluación a partir del organigrama sincronizado:
// una fila por cada unidad que tiene agentes asignados, con columnas vacías para que
// Capital Humano cargue quién evalúa esa unidad (legajo y mail del director o responsable).
//
// Uso:  node scripts/planilla-evaluadores.mjs   (antes: node --env-file=.env.local scripts/sync-padron.mjs)
//
// La salida no tiene datos personales: solo unidades y cantidad de agentes.

import { readFile, writeFile } from 'node:fs/promises';

const leer = async f => JSON.parse(await readFile(f, 'utf8')).datos;
const unidades = await leer('data/cache/reparticiones.json');
const agentes = await leer('data/cache/agentes.json');

const porCodigo = new Map(unidades.map(u => [u.codigo, u]));
const cantidad = new Map();
for (const a of agentes) cantidad.set(a.reparticionCodigo, (cantidad.get(a.reparticionCodigo) ?? 0) + 1);

// Secretaría y subsecretaría de la que depende cada unidad (incluida ella misma)
function ancestros(u) {
  const r = {};
  for (let x = u; x; x = porCodigo.get(x.dependeDe)) {
    if (x.tipo === 'secretaria') r.secretaria = x.nombre;
    if (x.tipo === 'subsecretaria') r.subsecretaria = x.nombre;
  }
  return r;
}

const TIPO = { secretaria: 'Secretaría', subsecretaria: 'Subsecretaría', direccion: 'Dirección', subdireccion: 'Subdirección' };
const filas = unidades
  .filter(u => cantidad.get(u.codigo))
  .map(u => ({ u, ...ancestros(u), n: cantidad.get(u.codigo) }))
  .sort((a, b) => a.secretaria.localeCompare(b.secretaria, 'es') || (a.subsecretaria ?? '').localeCompare(b.subsecretaria ?? '', 'es') || a.u.nombre.localeCompare(b.u.nombre, 'es'));

const encabezado = ['Secretaría', 'Subsecretaría', 'Unidad', 'Tipo', 'Código', 'Id GRH', 'Agentes',
  'Legajo del evaluador', 'Apellido y nombre del evaluador', 'Mail institucional del evaluador', 'Observaciones'];
const celda = v => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
// Criterio de Capital Humano: en las Secretarías evalúa el Secretario, a su personal directo y a los directores.
// Una subsecretaría sin evaluador pasa al Secretario (el sistema sube al nivel de arriba).
const guia = u =>
  u.tipo === 'secretaria'
    ? `Cargar ${u.nombre.startsWith('Secretaría') ? 'al Secretario' : 'a quien está a cargo'}: evalúa a su personal directo y a los directores del área`
    : u.tipo === 'subsecretaria' ? 'Si queda vacío, a este personal y a sus directores los evalúa el Secretario' : '';
const lineas = [encabezado, ...filas.map(f => [f.secretaria, f.subsecretaria ?? '', f.u.nombre, TIPO[f.u.tipo], f.u.codigo, f.u.idGrh ?? '', f.n, '', '', '', guia(f.u)])]
  .map(l => l.map(celda).join(';'));

// BOM + punto y coma: Excel en español lo abre con acentos y columnas correctas
await writeFile('data/evaluadores-por-unidad.csv', '﻿' + lineas.join('\r\n') + '\r\n', 'utf8');

const total = filas.reduce((s, f) => s + f.n, 0);
console.log(`Planilla generada: ${filas.length} unidades de evaluación, ${total} agentes.`);
