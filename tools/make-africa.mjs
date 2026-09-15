// Emits the Africa outline the map views draw, from the Natural Earth topology
// shipped in `world-atlas`.
//
// Two things are decided here rather than at runtime:
//
//   1. Africa only. The world topology is 108 KB at 110m and 739 KB at 50m; the
//      portal never shows a country outside Africa, and low bandwidth is a hard
//      requirement.
//   2. GeoJSON, not TopoJSON. Converting at build time means `topojson-client`
//      stays a build dependency instead of runtime bytes. Coordinates are rounded
//      to three decimals — about 100 m, far finer than a country fill needs.
//
// Survey membership is attached to each feature so the map can grey out the
// countries the survey has never covered without a second lookup.
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';

const here = dirname(fileURLToPath(import.meta.url));
const RESOLUTION = process.argv[2] ?? '110m';

// Natural Earth's own spellings. Curated rather than derived: the topology has no
// continent field, and a bounding box drags in Yemen, Cyprus and half of Iberia.
const AFRICA = new Set([
  'Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', 'Cabo Verde',
  'Cameroon', 'Central African Rep.', 'Chad', 'Comoros', 'Congo', "Côte d'Ivoire",
  'Dem. Rep. Congo', 'Djibouti', 'Egypt', 'Eq. Guinea', 'Eritrea', 'eSwatini',
  'Ethiopia', 'Gabon', 'Gambia', 'Ghana', 'Guinea', 'Guinea-Bissau', 'Kenya',
  'Lesotho', 'Liberia', 'Libya', 'Madagascar', 'Malawi', 'Mali', 'Mauritania',
  'Mauritius', 'Morocco', 'Mozambique', 'Namibia', 'Niger', 'Nigeria', 'Rwanda',
  'São Tomé and Principe', 'Senegal', 'Seychelles', 'Sierra Leone', 'Somalia',
  'Somaliland', 'South Africa', 'S. Sudan', 'Sudan', 'Tanzania', 'Togo', 'Tunisia',
  'Uganda', 'W. Sahara', 'Zambia', 'Zimbabwe',
]);

// Where the survey's country name and Natural Earth's differ.
const ALIAS = new Map([
  ['Democratic Republic of Congo', 'Dem. Rep. Congo'],
  ['DR Congo', 'Dem. Rep. Congo'],
  ['Republic of the Congo', 'Congo'],
  ['Congo Brazzaville', 'Congo'],
  ['DRC', 'Dem. Rep. Congo'],
  ['Ivory Coast', "Côte d'Ivoire"],
  ['Cote d Ivoire', "Côte d'Ivoire"],
  ['Eswatini', 'eSwatini'],
  ['Swaziland', 'eSwatini'],
  ['Cape Verde', 'Cabo Verde'],
  ['Sao Tome and Principe', 'São Tomé and Principe'],
  ['Equatorial Guinea', 'Eq. Guinea'],
  ['Central African Republic', 'Central African Rep.'],
  ['South Sudan', 'S. Sudan'],
]);

const round = (value) => {
  if (typeof value[0] === 'number') return [Math.round(value[0] * 1e3) / 1e3, Math.round(value[1] * 1e3) / 1e3];
  return value.map(round);
};

const topoPath = join(here, '..', 'node_modules', 'world-atlas', `countries-${RESOLUTION}.json`);
if (!existsSync(topoPath)) {
  console.log('world-atlas not installed — keeping the committed public/africa.geo.json.');
  process.exit(0);
}
const topo = JSON.parse(readFileSync(topoPath, 'utf8'));
const world = feature(topo, topo.objects.countries);

const content = JSON.parse(readFileSync(join(here, '..', 'src', 'data', 'content.json'), 'utf8'));
const surveyed = new Map();
for (const c of content.countries) surveyed.set(ALIAS.get(c.name) ?? c.name, c);

const features = [];
for (const f of world.features) {
  const name = f.properties.name;
  if (!AFRICA.has(name)) continue;
  const survey = surveyed.get(name);
  features.push({
    type: 'Feature',
    properties: {
      name,
      surveyName: survey?.name ?? null,
      iso3: survey?.iso3 ?? null,
      waves: survey?.waves ?? [],
    },
    geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
  });
}

const unmatched = [...surveyed.keys()].filter((n) => !features.some((f) => f.properties.name === n));
if (unmatched.length > 0) {
  // A surveyed country that never draws is the failure this map cannot survive:
  // a blank shape reads as "no data" when the truth is "we mis-spelled it".
  console.error(`No outline for surveyed ${unmatched.length}: ${unmatched.join(', ')}`);
  console.error('Add the Natural Earth spelling to ALIAS in tools/make-africa.mjs.');
  process.exit(1);
}

const out = join(here, '..', 'public', 'africa.geo.json');
const body = JSON.stringify({ type: 'FeatureCollection', features });
writeFileSync(out, body);

const gz = gzipSync(Buffer.from(body)).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`${RESOLUTION}: ${features.length} outlines, ${surveyed.size} surveyed`);
console.log(`  world topology  ${kb(statSync(topoPath).size)}`);
console.log(`  africa.geo.json ${kb(body.length)} raw · ${kb(gz)} gzipped`);
