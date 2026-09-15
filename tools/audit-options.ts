// Which questions we cannot draw honestly yet.
//
// The prototype flags a chart whose response options it had to invent. This
// script lists them, so the ask to PSB is a specific list of questions rather
// than "please send the codebook". Run it with `pnpm audit:options`.
import { questions, themes } from '../src/content';
import { optionsFor } from '../src/illustrative';

const charts = new Map(themes.flatMap((t) => t.charts.map((c) => [c.questions[0] ?? '', c])));

const rows = questions.map((q) => {
  const spec = charts.get(q.code);
  const options = optionsFor(q.code, q.text, spec?.showing ?? null);
  return { q, options, showing: spec?.showing ?? null };
});

const missing = rows.filter((r) => r.options.illustrative);
const known = rows.length - missing.length;

console.log(`Response options known for ${known} of ${rows.length} questions.\n`);
console.log(`We need the answer list for these ${missing.length}:\n`);

for (const theme of themes) {
  const inTheme = missing.filter((r) => r.q.theme === theme.order);
  if (inTheme.length === 0) continue;
  console.log(`${theme.name}`);
  for (const r of inTheme) {
    console.log(`  ${r.q.code}  ${r.q.label}`);
    console.log(`         ${r.q.text.slice(0, 110)}${r.q.text.length > 110 ? '…' : ''}`);
  }
  console.log('');
}

const filtered = questions.filter((q) => q.baseType === 'filtered');
if (filtered.length > 0) {
  console.log(`Also unresolved — the exact base for ${filtered.length} "among those…" questions:`);
  for (const q of filtered) console.log(`  ${q.code}  ${q.baseText ?? '(base stated on the slide, not in the question)'}`);
}
