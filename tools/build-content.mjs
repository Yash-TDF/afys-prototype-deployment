// Reads the portal's generated seed SQL and emits the prototype's content file.
//
// Why parse SQL rather than query the database: round zero must run on a laptop
// with nothing installed, and the seeds are the same source of truth the portal
// loads. Structure is real — the twelve tiles, the forty-one questions, the
// thirty-nine chart specifications, the twenty-eight countries and which waves
// they appear in. Numbers are not here at all; those are generated at runtime and
// labelled illustrative.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SEEDS = join(here, '..', '..', 'afys-portal', 'db', 'seeds');

// The generated file is committed, so the prototype runs on its own. This script
// only needs the portal checked out beside it when the deck has changed and the
// content has to be rebuilt.
if (!existsSync(SEEDS)) {
  console.log('afys-portal not found beside this repo — keeping the committed src/data/content.json.');
  console.log(`Clone it to ${join(here, '..', '..', 'afys-portal')} if you need to regenerate.`);
  process.exit(0);
}

/** Split one SQL row's value list on top-level commas, honouring quotes and nesting. */
function splitValues(row) {
  const out = [];
  let depth = 0, quoted = false, start = 0;
  for (let i = 0; i < row.length; i += 1) {
    const c = row[i];
    if (quoted) {
      if (c === "'") {
        if (row[i + 1] === "'") i += 1;      // '' is an escaped quote, not a close
        else quoted = false;
      }
      continue;
    }
    if (c === "'") quoted = true;
    else if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    else if (c === ',' && depth === 0) { out.push(row.slice(start, i).trim()); start = i + 1; }
  }
  out.push(row.slice(start).trim());
  return out;
}

/** Every `(...)` row of an INSERT, as arrays of raw SQL values. */
function rows(file) {
  const sql = readFileSync(join(SEEDS, file), 'utf8');
  let body = sql.slice(sql.indexOf('VALUES') + 'VALUES'.length);
  // Stop before the upsert clause — `ON DUPLICATE KEY UPDATE x = VALUES(x)` is
  // full of parentheses that would otherwise parse as extra rows.
  const upsert = body.indexOf('ON DUPLICATE');
  if (upsert !== -1) body = body.slice(0, upsert);
  const found = [];
  let depth = 0, quoted = false, start = -1;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (quoted) {
      if (c === "'") { if (body[i + 1] === "'") i += 1; else quoted = false; }
      continue;
    }
    if (c === "'") quoted = true;
    else if (c === '(') { if (depth === 0) start = i + 1; depth += 1; }
    else if (c === ')') { depth -= 1; if (depth === 0) found.push(body.slice(start, i)); }
    else if (c === ';' && depth === 0) break;
  }
  return found.map(splitValues);
}

const str = (v) => (v === 'NULL' ? null : v.slice(1, -1).replaceAll("''", "'"));
const num = (v) => (v === 'NULL' ? null : Number(v));
/** `(SELECT id FROM themes WHERE display_order = 4)` → 4; `… name = 'Côte d''Ivoire')` → "Côte d'Ivoire" */
const ref = (v) => {
  const m = v.match(/=\s*(?:'((?:[^']|'')*)'|(\d+))\s*\)/);
  return m ? (m[1] !== undefined ? m[1].replaceAll("''", "'") : Number(m[2])) : null;
};
const jsonArray = (v) => {
  if (v === 'NULL') return [];
  return [...v.matchAll(/'([^']*)'/g)].map((m) => m[1]);
};

const countries = rows('001_countries.sql').map(([name, iso, region]) => ({
  name: str(name), iso3: str(iso), region: str(region),
}));

const waves = rows('002_waves.sql').map(([year, label, , , , order]) => ({
  year: num(year), label: str(label), order: num(order),
}));

const membership = new Map(countries.map((c) => [c.name, []]));
const years = new Set(waves.map((w) => w.year));
const unresolved = [];
for (const [country, wave] of rows('003_country_wave.sql')) {
  const list = membership.get(ref(country));
  const year = ref(wave);
  if (list && years.has(year)) list.push(year);
  else unresolved.push(`${country}, ${wave}`);
}
if (unresolved.length > 0) {
  // A row that does not resolve takes a country out of a wave without a sound, and
  // the map then says "never surveyed" where the seeds say it was asked.
  console.error(`003_country_wave.sql: ${unresolved.length} row(s) name a country or wave the seeds do not have:`);
  for (const row of unresolved) console.error(`  (${row})`);
  process.exit(1);
}
for (const c of countries) c.waves = (membership.get(c.name) ?? []).sort();

const themes = rows('004_themes.sql').map(([name, slug, order, , colour]) => ({
  name: str(name), slug: str(slug), order: num(order), accent: str(colour),
  questions: [], charts: [],
}));
const byOrder = new Map(themes.map((t) => [t.order, t]));

const questions = rows('005_questions.sql').map((r) => {
  const [theme, code, text, label, order, responseType, baseType, baseText, , tracked, surfaced, notes] = r;
  return {
    code: str(code), theme: ref(theme), text: str(text), label: str(label),
    order: num(order), responseType: str(responseType), baseType: str(baseType),
    baseText: str(baseText), tracked: num(tracked) === 1, surfaced: num(surfaced) === 1,
    slide: str(notes),
  };
});
for (const q of questions) byOrder.get(q.theme)?.questions.push(q.code);

const charts = rows('006_tile_charts.sql').map((r) => {
  const [theme, order, title, type, qids, , comparison, , slide, caveat, showing] = r;
  return {
    theme: ref(theme), order: num(order), title: str(title), type: str(type),
    questions: jsonArray(qids), comparison: str(comparison), slide: num(slide),
    caveat: str(caveat), showing: str(showing),
  };
});
for (const c of charts) byOrder.get(c.theme)?.charts.push(c);

const content = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'afys-portal/db/seeds — structure only, no survey results',
  waves, countries, themes, questions, charts,
};

const out = join(here, '..', 'src', 'data');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'content.json'), `${JSON.stringify(content, null, 1)}\n`);

const chartTypes = [...new Set(charts.map((c) => c.type))].sort();
console.log(`themes ${themes.length} · questions ${questions.length} · charts ${charts.length}`);
console.log(`countries ${countries.length} · waves ${waves.map((w) => w.year).join(', ')}`);
console.log(`chart types: ${chartTypes.join(', ')}`);
console.log(`per wave: ${waves.map((w) => `${w.year}=${countries.filter((c) => c.waves.includes(w.year)).length}`).join(' ')}`);
