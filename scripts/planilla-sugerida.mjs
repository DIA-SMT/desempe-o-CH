// Precompleta la planilla de evaluadores con quién evaluó a la gente de cada unidad en el último
// semestre histórico, para que Capital Humano solo confirme o corrija (y agregue el mail).
//
// Uso:  npm run padron:planilla-sugerida
//       (antes: npm run padron:sync, npm run padron:planilla y el histórico importado)
//
// Para cada unidad mira a los agentes que hoy trabajan ahí y quién los evaluó en el semestre más
// reciente con datos; sugiere al que evaluó a la mayoría. Las subsecretarías no se precompletan:
// si quedan vacías, las evalúa el Secretario (criterio de Capital Humano).
//
// La salida tiene nombres y legajos de funcionarios: va a data/historico/, que está fuera de git.

import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Falta SUPABASE_DB_URL en .env.local (Supabase > Connect > Session pooler).');
  process.exit(1);
}

const leer = async (f) => JSON.parse(await readFile(f, 'utf8')).datos;
const unidades = new Map((await leer('data/cache/reparticiones.json')).map((u) => [u.codigo, u]));
const agentes = await leer('data/cache/agentes.json');
const padron = new Map(agentes.map((a) => [a.legajo, a]));
const porUnidad = new Map();
for (const a of agentes) porUnidad.set(a.reparticionCodigo, [...(porUnidad.get(a.reparticionCodigo) ?? []), a.legajo]);

// Evaluaciones históricas: a quién evaluó cada evaluador, por semestre (del más nuevo al más viejo)
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
const { rows } = await db.query(`
  select p.nombre as periodo, p.cierre, e.legajo, e.evaluador_legajo, e.evaluador_nombre, pp.unidad_codigo
  from evaluaciones e join periodos p on p.id = e.periodo_id
  join padron_periodo pp on pp.periodo_id = e.periodo_id and pp.legajo = e.legajo
  where p.historico and e.estado = 'enviada' and e.evaluador_legajo is not null
  order by p.cierre desc`);
await db.end();
const semestres = [...new Set(rows.map((r) => r.periodo))];
const evaluadorDe = new Map(semestres.map((s) => [s, new Map()]));
// Segundo intento, cuando los legajos de los evaluados no coinciden con el padrón actual:
// la repartición que escribió el evaluador en el formulario (ya cruzada con CapitalIA al importar)
const porReparticion = new Map(semestres.map((s) => [s, new Map()]));
for (const r of rows) {
  const ev = { legajo: r.evaluador_legajo, nombre: r.evaluador_nombre };
  evaluadorDe.get(r.periodo).set(r.legajo, ev);
  const m = porReparticion.get(r.periodo);
  m.set(r.unidad_codigo, [...(m.get(r.unidad_codigo) ?? []), { ...ev, evaluado: r.legajo }]);
}

// La unidad está en la línea de mando de la otra (es ella, la contiene o depende de ella)
const linea = (codigo) => {
  const r = [];
  for (let u = unidades.get(codigo); u; u = unidades.get(u.dependeDe)) r.push(u.codigo);
  return r;
};
const relacionadas = (a, b) => linea(a).includes(b) || linea(b).includes(a);

const celda = (v) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const texto = (await readFile('data/evaluadores-por-unidad.csv', 'utf8')).replace(/^﻿/, '');
const [encabezado, ...filas] = texto.split(/\r?\n/).filter(Boolean).map((l) => l.split(';'));
const col = (nombre) => encabezado.indexOf(nombre);
const [cTipo, cCodigo, cLegajo, cNombre] = ['Tipo', 'Código', 'Legajo del evaluador', 'Apellido y nombre del evaluador'].map(col);

let sugeridas = 0, revisar = 0;
const salida = filas.map((f) => {
  const codigo = f[cCodigo];
  const legajos = porUnidad.get(codigo) ?? [];
  let sugerido = null, semestre = '', evaluados = '', otros = [], segun = '';
  const contar = (lista) => {
    const cuenta = new Map();
    for (const ev of lista) {
      const c = cuenta.get(ev.legajo) ?? { legajo: ev.legajo, nombre: ev.nombre, n: 0 };
      c.n++;
      cuenta.set(ev.legajo, c);
    }
    return [...cuenta.values()].sort((a, b) => b.n - a.n);
  };
  for (const s of semestres) {
    const porAgente = legajos.map((l) => evaluadorDe.get(s).get(l)).filter((ev, k) => ev && ev.legajo !== legajos[k]);
    if (!porAgente.length) continue;
    [sugerido, ...otros] = contar(porAgente);
    semestre = s;
    evaluados = `${porAgente.length} de ${legajos.length}`;
    break;
  }
  if (!sugerido) {
    for (const s of semestres) {
      const lista = (porReparticion.get(s).get(codigo) ?? []).filter((ev) => ev.legajo !== ev.evaluado);
      if (!lista.length) continue;
      [sugerido, ...otros] = contar(lista);
      semestre = s;
      evaluados = `${lista.length} evaluados en la repartición`;
      segun = 'por el nombre de la repartición';
      break;
    }
  }

  const notas = [];
  const actual = sugerido ? padron.get(sugerido.legajo) : null;
  if (!sugerido) notas.push('Sin datos de semestres anteriores');
  else {
    if (segun) notas.push('Sugerido por el nombre de la repartición: los legajos de los evaluados no coinciden con el padrón actual');
    if (!actual) notas.push(`El legajo ${sugerido.legajo} no figura en el padrón actual`);
    else if (!relacionadas(actual.reparticionCodigo, codigo)) notas.push(`Hoy figura en ${actual.reparticion}`);
    if (otros.length) notas.push(`También evaluaron: ${otros.map((o) => `${o.nombre} (${o.n})`).join(', ')}`);
  }
  const esSubsecretaria = f[cTipo] === 'Subsecretaría';
  if (esSubsecretaria && sugerido) notas.push(`En ${semestre} los evaluó ${actual?.nombre ?? sugerido.nombre}; si queda vacío, los evalúa el Secretario`);

  if (sugerido && !esSubsecretaria) {
    f[cLegajo] = sugerido.legajo;
    f[cNombre] = actual?.nombre ?? sugerido.nombre;
    sugeridas++;
  }
  if (notas.length) revisar++;
  return [...f, semestre, evaluados, notas.join('. ')];
});

const lineas = [[...encabezado, 'Sugerido según', 'Agentes actuales evaluados ese semestre', 'Para revisar'], ...salida]
  .map((l) => l.map(celda).join(';'));
await writeFile('data/historico/evaluadores-sugeridos.csv', '﻿' + lineas.join('\r\n') + '\r\n', 'utf8');
console.log(`Planilla sugerida: ${sugeridas} de ${filas.length} unidades precompletadas, ${revisar} con algo para revisar.`);
console.log('Guardada en data/historico/evaluadores-sugeridos.csv (fuera de git).');
