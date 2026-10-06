// What we still need from PSB before every chart here can be real.
//
// `pnpm audit:options` prints it; `pnpm audit:options --write` also writes
// NEEDED_FROM_PSB.md. The file is this script's output and nothing else — it went
// stale once already, by hand, and told the reader to ask PSB for nine answer
// lists PSB had sent a week earlier.
//
// Two things it used to get wrong, both by looking somewhere other than the
// screen. It counted a question as known if *any* route to a label worked,
// including the "Showing % selecting ‘Very good’ or ‘Good’" line on a deck slide —
// but the explorer has no slide and draws that question from a fallback scale. So
// this asks the view model what it draws, which is what the reader sees. And it
// listed every filtered base as unresolved after two of the three had been
// settled from the questionnaire's own routing.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { questions, themes, type ChartSpec } from '../src/content';
import { buildViewModel, DEFAULT_FILTERS } from '../src/model';
import recovered from '../src/data/options.json';

const LISTS = (recovered as { source: string; options: Record<string, string[]> });

/** A question on its own, as the explorer draws it: no slide, so no "showing" line to borrow from. */
const alone = (code: string, theme: number, title: string): ChartSpec => ({
  theme, order: 1, title, type: 'hbar', questions: [code],
  comparison: 'none', slide: null, caveat: null, showing: null,
});

const rows = questions.map((q) => {
  const theme = themes.find((t) => t.order === q.theme)!;
  const model = buildViewModel(alone(q.code, q.theme, q.label), theme, DEFAULT_FILTERS);
  return { q, theme, invented: model.optionsInvented, listed: (LISTS.options[q.code] ?? []).length };
});

// A grid's rows take the grid's answer scale, which the questionnaire sets in
// the METRIC header above the grid and the portal's bands.yaml records for each
// row. That is not an ask of PSB: the prototype draws them as placeholders only
// because its content does not carry the scales yet (review of #20).
const gridRows = rows.filter((r) => r.q.parent !== null);
const invented = rows.filter((r) => r.invented && r.q.parent === null);

/**
 * Why a question is still open, where "we have not been sent it" is not the reason.
 * Keyed by code; anything absent gets the plain ask.
 */
const WHY: Record<string, string> = {
  T10_Q1:
    'The questionnaire has this list. It is held back on purpose: deck slide 41 plots three '
    + 'questions on one chart — "Very good" from this one, "Get better" from T10_Q2 and "Better life '
    + 'than my parents" from T10_Q3 — and one set of answer choices cannot describe three questions. '
    + 'What we need is what that chart is meant to show.',
};

/**
 * The filtered bases, and where each stands. The status is ours to keep current;
 * the wording beside it is the questionnaire's.
 */
const BASES: Record<string, { settled: boolean; note: string }> = {
  T03_Q1: {
    settled: false,
    note:
      'A grid with no figures of its own: each organisation is a child question on its own base '
      + '(below), which reproduces slide 13 for 2024 and 2026. Still open: in 2020 the follow-up was '
      + 'asked only of "a lot" and "some", and 2022 matches neither routing. Being put to PSB; until '
      + 'they answer, those two waves are not loaded.',
  },
  T03_Q1_AU: {
    settled: true,
    note: 'Among those who said the African Union has a lot, some or a little influence (QFR9_mA, METRIC A), '
      + 'from the questionnaire routing. With this base the delivered file reproduces slide 13 (THE-315).',
  },
  T03_Q1_UN: {
    settled: true,
    note: 'Among those who said the United Nations has a lot, some or a little influence (QFR17_mA, METRIC A), '
      + 'from the questionnaire routing. With this base the delivered file reproduces slide 13 (THE-315).',
  },
  T03_Q1_WTO: {
    settled: true,
    note: 'Among those who said the World Trade Organisation has a lot, some or a little influence (QFR10_mA, METRIC A), '
      + 'from the questionnaire routing. With this base the delivered file reproduces slide 13 (THE-315).',
  },
  T03_Q1_IMF: {
    settled: true,
    note: 'Among those who said the IMF has a lot, some or a little influence (QFR21_mA, METRIC A), '
      + 'from the questionnaire routing. With this base the delivered file reproduces slide 13 (THE-315).',
  },
  T03_Q1_EU: {
    settled: true,
    note: 'Among those who said the European Union has a lot, some or a little influence (QFR8_mA, METRIC A), '
      + 'from the questionnaire routing. With this base the delivered file reproduces slide 13 (THE-315).',
  },
  T03_Q1_G20: {
    settled: true,
    note: 'Among those who said the G20 has a lot, some or a little influence (QFR16_mA, METRIC A), '
      + 'from the questionnaire routing. With this base the delivered file reproduces slide 13 (THE-315).',
  },
  T06_Q3: { settled: true, note: 'Questionnaire routing: IF QEMIGRATE1=C1-C3. Confirmed by PSB.' },
  T06_Q2: { settled: true, note: 'Questionnaire routing: IF QEMIGRATE1=C1-C3, up to two answers. Confirmed by PSB.' },
};

const out: string[] = [];
const say = (line = ''): void => { out.push(line); };

say('# What we still need from PSB before these charts can be real');
say();
say('_Written by `pnpm audit:options --write`. Do not edit by hand: change the data or the script and run it again._');
say();
say(`Answer lists: ${LISTS.source}`);
say();
say('## Answer options');
say();
const asked = rows.length - gridRows.length;
say(`**${asked - invented.length} of ${asked}** questions are drawn with their real answer options.`);
say();
if (invented.length === 0) {
  say('None outstanding.');
} else {
  say(`${invented.length === 1 ? 'One is' : `${invented.length} are`} drawn with placeholder options, and the chart says so underneath:`);
  say();
  for (const r of invented) {
    say(`- **${r.q.code} · ${r.q.label}** (${r.theme.name})  `);
    say(`  _${r.q.text}_  `);
    say(`  ${WHY[r.q.code] ?? 'We need the full answer list for this question.'}`);
  }
}
say();
if (gridRows.length > 0) {
  say(`Not counted above: ${gridRows.length} rows of grid questions. Each takes its grid's answer scale, `
    + 'which the questionnaire sets above the grid and the portal records per row, so nothing is needed '
    + 'from PSB for them; the prototype still draws their own answers as placeholders.');
  say();
}
say('The real lists still need checking against the .sav value labels, since a chart can shorten a label.');

const filtered = questions.filter((q) => q.baseType === 'filtered');
const unknown = filtered.filter((q) => !(q.code in BASES));
if (unknown.length > 0) {
  // Better to stop than to publish a list that silently leaves one out.
  throw new Error(`Filtered-base question(s) with no entry in BASES: ${unknown.map((q) => q.code).join(', ')}`);
}

say();
say('## Bases for the "among those…" questions');
say();
const open = filtered.filter((q) => !BASES[q.code]!.settled);
say(`${filtered.length - open.length} of ${filtered.length} settled.`);
say();
for (const q of filtered) {
  const base = BASES[q.code]!;
  say(`- **${q.code} · ${q.label}** — ${base.settled ? 'settled' : '**open**'}  `);
  say(`  Deck: _${q.baseText ?? 'base stated on the slide, not in the question'}_  `);
  say(`  ${base.note}`);
}
say();

const text = out.join('\n');
console.log(text);

if (process.argv.includes('--write')) {
  // From the working directory, not from this file: the script runs as a bundle
  // out of node_modules/.cache, and pnpm starts it in the package root.
  const target = join(process.cwd(), 'NEEDED_FROM_PSB.md');
  writeFileSync(target, `${text}\n`, 'utf8');
  console.error(`\nWrote ${target}`);
}
