// Precompleta la planilla de evaluadores para que Capital Humano solo confirme o corrija.
//
// Uso:  npm run padron:planilla-sugerida
//       (antes: npm run padron:sync, npm run padron:planilla, la nómina cargada con
//        npm run padron:no-evaluables y el histórico importado)
//
// Criterio de Capital Humano (04/11/2026): en cada Dirección evalúa su director; si no hay, el superior
// inmediato (Subsecretario o Secretario). En las Secretarías y Subsecretarías, su titular evalúa al
// personal directo. Los funcionarios no se evalúan.
// - El evaluador sugerido es el titular de la unidad según la nómina de funcionarios.
// - Si la nómina no tiene titular, la fila queda vacía (sube al superior inmediato).
// - Como referencia, se muestra quién evaluó a la gente de la unidad en el último semestre histórico.
//
// La salida tiene nombres y legajos de funcionarios: va a data/historico/, que está fuera de git.

import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Falta SUPABASE_DB_URL en .env.local (Supabase > Connect > Session pooler).');
  process.exit(1);
}

// Funciones que son titulares de cada tipo de unidad
const TITULARES = {
  'Secretaría': ['SECRETARIO', 'FISCAL MUNICIPAL'],
  'Subsecretaría': ['SUBSECRETARIO'],
  'Dirección': ['DIRECTOR', 'DIRECTOR DE DESPACHO', 'TESORERO', 'CONTADOR'],
};

const leer = async (f) => JSON.parse(await readFile(f, 'utf8')).datos;
const agentes = await leer('data/cache/agentes.json');
const padron = new Map(agentes.map((a) => [a.legajo, a]));

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
const { rows: noEvaluables } = await db.query('select legajo, nombre, motivo, funcion, unidad_codigo from no_evaluables');
const { rows: historico } = await db.query(`
  select p.nombre as periodo, e.legajo, e.evaluador_legajo, e.evaluador_nombre
  from evaluaciones e join periodos p on p.id = e.periodo_id
  where p.historico and e.estado = 'enviada' and e.evaluador_legajo is not null
  order by p.cierre desc`);
await db.end();

const excluidos = new Set(noEvaluables.map((n) => n.legajo));
const evaluable = (legajo) => /^[0-9]{5}$/.test(legajo) && !excluidos.has(legajo);
const evaluables = new Map();
for (const a of agentes) if (evaluable(a.legajo)) evaluables.set(a.reparticionCodigo, [...(evaluables.get(a.reparticionCodigo) ?? []), a.legajo]);
const titularesDe = new Map();
for (const n of noEvaluables) if (n.funcion && n.unidad_codigo) titularesDe.set(n.unidad_codigo, [...(titularesDe.get(n.unidad_codigo) ?? []), n]);

// Último semestre en que se evaluó a la gente de cada unidad (solo como referencia)
const semestres = [...new Set(historico.map((r) => r.periodo))];
const evaluadorDe = new Map(semestres.map((s) => [s, new Map()]));
for (const r of historico) evaluadorDe.get(r.periodo).set(r.legajo, { legajo: r.evaluador_legajo, nombre: r.evaluador_nombre });
function ultimoEvaluador(legajos) {
  for (const s of semestres) {
    const cuenta = new Map();
    for (const l of legajos) {
      const ev = evaluadorDe.get(s).get(l);
      if (ev && ev.legajo !== l) cuenta.set(ev.legajo, { ...ev, n: (cuenta.get(ev.legajo)?.n ?? 0) + 1 });
    }
    if (cuenta.size) return { semestre: s, ...[...cuenta.values()].sort((a, b) => b.n - a.n)[0] };
  }
  return null;
}

const celda = (v) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const nombreDe = (legajo, otro) => padron.get(legajo)?.nombre ?? otro;

const texto = (await readFile('data/evaluadores-por-unidad.csv', 'utf8')).replace(/^﻿/, '');
const [encabezado, ...filas] = texto.split(/\r?\n/).filter(Boolean).map((l) => l.split(';'));
const col = (nombre) => encabezado.indexOf(nombre);
const [cTipo, cCodigo, cAgentes, cLegajo, cNombre] = ['Tipo', 'Código', 'Agentes', 'Legajo del evaluador', 'Apellido y nombre del evaluador'].map(col);

let conTitular = 0, revisar = 0;
const salida = filas.map((f) => {
  const codigo = f[cCodigo], tipo = f[cTipo];
  const gente = evaluables.get(codigo) ?? [];
  f[cAgentes] = String(gente.length); // sin funcionarios ni legajos de 6 dígitos
  const titulares = (titularesDe.get(codigo) ?? []).filter((n) => (TITULARES[tipo] ?? []).includes(n.funcion));
  const antes = ultimoEvaluador(gente);
  const notas = [];

  if (titulares.length) {
    const [t] = titulares;
    f[cLegajo] = t.legajo;
    f[cNombre] = nombreDe(t.legajo, t.nombre);
    conTitular++;
    if (titulares.length > 1) notas.push(`La nómina tiene ${titulares.length} titulares: ${titulares.map((n) => `${nombreDe(n.legajo, n.nombre)} (${n.funcion})`).join(', ')}`);
    if (antes && antes.legajo !== t.legajo) notas.push(`En ${antes.semestre} evaluó ${nombreDe(antes.legajo, antes.nombre)}`);
  } else {
    notas.push(`Sin ${tipo === 'Dirección' ? 'director' : 'titular'} en la nómina: la evalúa el superior inmediato${antes ? `. En ${antes.semestre} evaluó ${nombreDe(antes.legajo, antes.nombre)}` : ''}`);
  }
  if (!gente.length) notas.push('No tiene personal para evaluar (solo funcionarios o legajos de 6 dígitos)');
  if (notas.length) revisar++;
  return [...f, titulares.length ? 'Nómina de funcionarios' : '', antes ? `${nombreDe(antes.legajo, antes.nombre)} (${antes.semestre})` : '', notas.join('. ')];
});

const lineas = [[...encabezado, 'Sugerido según', 'Evaluó en el último semestre', 'Para revisar'], ...salida]
  .map((l) => l.map(celda).join(';'));
await writeFile('data/historico/evaluadores-sugeridos.csv', '﻿' + lineas.join('\r\n') + '\r\n', 'utf8');
const total = [...evaluables.values()].reduce((s, l) => s + l.length, 0);
console.log(`Planilla sugerida: ${conTitular} de ${filas.length} unidades con titular según la nómina, ${revisar} con algo para revisar.`);
console.log(`${total} agentes para evaluar (sin funcionarios ni legajos de 6 dígitos).`);
console.log('Guardada en data/historico/evaluadores-sugeridos.csv (fuera de git).');
