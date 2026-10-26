// PSB's feedback of 22 Oct on the review link (THE-417), every point of it:
// - the footer is PSB's one line, both old lines gone; the illustrative banner stays;
// - the landing's subtitle is PSB's sentence, on one line at 1280; "16 countries", "4,901" and
//   "2026" are bold in their cards; Key themes reads "From dozens of topics included across the
//   four waves";
// - each tile shows its change since the wave before its latest ("since 2024") beside its first,
//   on one row at 1280, coloured by the number printed and read out in the tile's label, and only
//   where the trend has a figure for that wave that isn't its first. Each pair matches a line its
//   theme page draws;
// - Methodology: the African Union's regions for every country, past waves included, in the AU's
//   order and credited to it with its link; no Northern; no "no agreed region yet" note; the
//   map's country panel names each country's region;
// - the Study overview's Interviews row has no "(file count; no published total)";
// - Languages and locations: Michael's five spellings corrected; Tanzania, Mali and Senegal the
//   right way round; nothing awaited or being checked; face to face in all four waves; the old
//   comment gone;
// - Explore: the Region field offers each wave's AU regions, earlier waves included; choosing one
//   selects exactly its countries surveyed in that wave, and it stays chosen.
//
// Read-only for the repo. Run with the prototype served (`pnpm exec vite`), then
//   node tools/verify-the-417.mjs [--url http://localhost:5173]
// At 1280 and 390px where layout matters. Exits 1 on any failure.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const argv = process.argv.slice(2);
const urlAt = argv.indexOf('--url');
const BASE = (urlAt >= 0 ? argv[urlAt + 1] : (process.env.BASE_URL ?? 'http://localhost:5173')).replace(/\/$/, '');

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const content = read('../src/data/content.json');
const fieldwork = read('../src/data/fieldwork.json');

// PSB's words of 22 Oct, as THE-417 records them.
const FOOTER = '© 2026 Ichikowitz Family Foundation. Research by PSB Insights. All rights reserved.';
const LEDE = 'Explore findings across 28 countries, from young people aged 18 to 24 interviewed in four waves from 2020 to 2026.';
const KEY_THEMES = 'From dozens of topics included across the four waves';
const FACE_TO_FACE = 'All interviews were face to face, in all four waves.';
// The African Union's regions, in its order (au.int, member states), and where it is credited.
const AU_ORDER = ['Northern', 'Southern', 'Eastern', 'Western', 'Central'];
const AU_URL = 'https://au.int/en/member_states/countryprofiles2';
// Michael's corrections of 22 Oct: country, column, the spelling now, and the one it replaces.
const SPELLINGS = [
  ['Cameroon', 'locations', 'Kribi', /\bKibi\b/],
  ['Chad', 'locations', "N'Djamena", /N'jamena/],
  ['Chad', 'locations', 'Sarh', /\bSahr\b/],
  ['Kenya', 'locations', 'Mombasa', /Mombassa/],
  ['Sudan', 'locations', 'Khartoum North', /Khatoum/],
  ['Rwanda', 'languages', 'Kinyarwanda', /KiyarRwanda/],
];
// Each the right way round: a place among the locations, a language among the languages.
const ROUND = [
  ['Tanzania', 'Dar es Salaam', 'Swahili'],
  ['Mali', 'Bamako', 'Bambara'],
  ['Senegal', 'Dakar', 'Wolof'],
];

const years = content.waves.map((w) => w.year).sort((a, b) => a - b);
const latest = years.at(-1);
const inWave = (year) => content.countries.filter((c) => c.waves.includes(year));
const byRegion = (list) => {
  const out = new Map();
  for (const c of list) if (c.region) out.set(c.region, [...(out.get(c.region) ?? []), c.name].sort((a, b) => a.localeCompare(b)));
  return AU_ORDER.filter((r) => out.has(r)).map((r) => [r, out.get(r)]);
};
const n = (value) => value.toLocaleString('en-GB');

const browser = await pw.chromium.launch(process.env.CHROME_PATH
  ? { headless: true, executablePath: process.env.CHROME_PATH }
  : { headless: true, channel: 'chrome' });

let failed = 0;
const check = (name, pass, detail) => {
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : ` — ${JSON.stringify(detail).slice(0, 500)}`}`);
};

// The data the pages are built from.
check('content.json gives every one of its 28 countries an African Union region, and none is Northern',
  content.countries.length === 28 && content.countries.every((c) => AU_ORDER.includes(c.region) && c.region !== 'Northern'),
  content.countries.filter((c) => !AU_ORDER.includes(c.region) || c.region === 'Northern').map((c) => [c.name, c.region]));
check('content.json has 28 countries in four waves, 2020 to 2026, as the subtitle says',
  content.countries.length === 28 && years.join() === '2020,2022,2024,2026', years);

const errors = [];
async function open(width, hash) {
  const page = await browser.newPage({ viewport: { width, height: 1100 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  page.on('pageerror', (e) => errors.push(`${hash}: ${e.message}`));
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'load' });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(1500);
  return page;
}

// ---- Every page: the footer and the banner -------------------------------------------------
{
  const page = await open(1280, '#/');
  const shell = await page.evaluate(() => ({
    footer: [...document.querySelectorAll('.site-footer p')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()),
    links: document.querySelectorAll('.site-footer a').length,
    banner: document.querySelector('.illustrative-banner')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
  }));
  check('the footer is PSB\'s one line, as plain text, and both old lines are gone',
    shell.footer.length === 1 && shell.footer[0] === FOOTER && shell.links === 0, shell);
  check('the "Illustrative prototype" banner is still at the top', Boolean(shell.banner?.startsWith('Illustrative prototype.')), shell.banner);
  await page.close();
}

// ---- The landing ---------------------------------------------------------------------------
const wantStrong = {
  Countries: `${inWave(latest).length} countries`,
  Respondents: n(fieldwork.waves[String(latest)].interviews),
  'Survey waves': String(latest),
  'Key themes': null,
};
for (const width of [1280, 390]) {
  const at = `at ${width}px`;
  const page = await open(width, '#/');
  const view = await page.evaluate(() => {
    const lede = document.querySelector('.hero > p');
    const range = document.createRange();
    if (lede) range.selectNodeContents(lede);
    const tops = lede ? new Set([...range.getClientRects()].map((r) => Math.round(r.top))) : new Set();
    return {
      lede: lede?.textContent ?? null,
      lines: tops.size,
      cards: [...document.querySelectorAll('.stat-row .stat')].map((card) => ({
        label: card.querySelector('.label')?.textContent ?? null,
        sub: card.querySelector('.sub')?.textContent ?? null,
        strong: [...card.querySelectorAll('.sub strong')].map((s) => s.textContent),
        weight: [...card.querySelectorAll('.sub strong')].map((s) => Number(getComputedStyle(s).fontWeight)),
      })),
    };
  });
  check(`${at}, the subtitle is PSB's sentence`, view.lede === LEDE, view.lede);
  if (width === 1280) check(`${at}, the subtitle sits on one line`, view.lines === 1, view.lines);
  check(`${at}, "16 countries", "4,901" and "2026" are bold in their cards, and nothing else is`,
    view.cards.length === 4 && view.cards.every((c) => (wantStrong[c.label] === null
      ? c.strong.length === 0
      : c.strong.length === 1 && c.strong[0] === wantStrong[c.label] && c.weight[0] >= 600)),
    view.cards.map((c) => [c.label, c.strong, c.weight]));
  check(`${at}, the Key themes card reads "${KEY_THEMES}"`,
    view.cards.find((c) => c.label === 'Key themes')?.sub === KEY_THEMES, view.cards.map((c) => c.sub));
  await page.close();
}

// The tiles' two changes. A trend's figures are contiguous from its first wave to its latest, so
// it has a figure for the wave before its latest exactly when it starts before that wave.
const said = (shown, from) => (shown === 0
  ? `unchanged since ${from}`
  : `${shown > 0 ? 'up' : 'down'} ${Math.abs(shown)} point${Math.abs(shown) === 1 ? '' : 's'} since ${from}`);
const direction = (shown) => (shown > 0 ? 'up' : shown < 0 ? 'down' : 'flat');
const PILL = /^([+-]?\d+)pts? since (\d{4})$/;
const tilesAt = {};
for (const width of [1280, 390]) {
  const page = await open(width, '#/');
  tilesAt[width] = await page.evaluate(() => [...document.querySelectorAll('a.tile')].map((t) => {
    const r = t.getBoundingClientRect();
    const pills = [...t.querySelectorAll('.tstat-pills .tstat-d')];
    return {
      slug: (t.getAttribute('href') ?? '').replace('#/theme/', ''),
      label: t.getAttribute('aria-label') ?? '',
      headline: t.querySelector('.tstat-v')?.textContent ?? null,
      note: t.querySelector('.tstat-l > .tstat-d')?.textContent ?? null,
      pills: pills.map((p) => ({ text: p.textContent, cls: p.className, top: Math.round(p.getBoundingClientRect().top) })),
      inside: [...t.querySelectorAll('.tstat-l *')].every((el) => {
        const b = el.getBoundingClientRect();
        return b.width === 0 || (b.left >= r.left - 0.5 && b.right <= r.right + 0.5);
      }),
      chip: t.querySelector('.chip')?.textContent ?? null,
    };
  }));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const at = `at ${width}px`;
  const tiles = tilesAt[width];
  const wrong = [];
  for (const t of tiles) {
    if (t.headline === null) continue;
    if (t.pills.length === 0) {
      // No trend: a note in place of a change, and no pill row.
      if (!t.note || /since \d{4}/.test(t.note)) wrong.push([t.slug, 'a figure without a trend should show its note only', t.note]);
      continue;
    }
    const first = t.pills[0].text.match(PILL);
    const to = Number(t.label.match(/ in (\d{4}),/)?.[1]);
    if (!first || !Number.isFinite(to)) { wrong.push([t.slug, 'unreadable', t.pills, t.label]); continue; }
    const from = Number(first[2]);
    const before = years.filter((y) => y < to).at(-1);
    const wantRecent = before !== undefined && from < before;
    if (t.pills.length !== (wantRecent ? 2 : 1)) { wrong.push([t.slug, `expected ${wantRecent ? 2 : 1} pill(s)`, t.pills.map((p) => p.text)]); continue; }
    const parsed = t.pills.map((p) => ({ ...p, m: p.text.match(PILL) }));
    if (parsed.some((p) => !p.m)) { wrong.push([t.slug, 'a pill reads oddly', t.pills.map((p) => p.text)]); continue; }
    if (wantRecent && Number(parsed[1].m[2]) !== before) wrong.push([t.slug, `second pill should be since ${before}`, parsed[1].text]);
    for (const p of parsed) {
      if (!p.cls.split(' ').includes(direction(Number(p.m[1])))) wrong.push([t.slug, 'colour does not follow the printed number', p.text, p.cls]);
    }
    const spoken = `${said(Number(parsed[0].m[1]), from)}${wantRecent ? ` and ${said(Number(parsed[1].m[1]), before)}` : ''}.`;
    if (!t.label.includes(spoken)) wrong.push([t.slug, 'the label does not read the changes', spoken, t.label]);
  }
  check(`${at}, each tile with a trend has its change since its first wave, and its change since the wave before its latest exactly where the trend starts earlier; each pill coloured by its printed number and read out in the tile's label`,
    wrong.length === 0, wrong);
  const two = tiles.filter((t) => t.pills.length === 2);
  check(`${at}, the check reached tiles with two pills (${two.length}) and every tile kept its Illustrative chip`,
    two.length > 0 && tiles.every((t) => t.headline === null || t.chip === 'Illustrative'), tiles.map((t) => [t.slug, t.pills.length, t.chip]));
  if (width === 1280) {
    check(`${at}, every tile's two pills share one row`, two.every((t) => Math.abs(t.pills[0].top - t.pills[1].top) <= 1),
      two.filter((t) => Math.abs(t.pills[0].top - t.pills[1].top) > 1).map((t) => [t.slug, t.pills]));
  }
  check(`${at}, the figures' text stays inside its tile, and there's no sideways scroll`,
    tiles.every((t) => t.inside) && overflow <= 0, { overflow, outside: tiles.filter((t) => !t.inside).map((t) => t.slug) });
  await page.close();
}

// Each two-pill tile's numbers against a line the site draws: the headline in its latest wave,
// less its first-wave and its previous-wave figures, give its two pills. The line is on its theme
// page; where that page draws the chart as a pie of the latest wave (slide 29), it is the same
// question over time in Explore.
{
  const page = await open(1280, '#/');
  const unmatched = [];
  const lines = (scope) => page.evaluate(async (scope) => {
    const { Chart } = await import('/src/charts/setup.ts');
    const out = [];
    const year = (l) => Number(String([].concat(l).join(' ')).replace('*', ''));
    for (const canvas of document.querySelectorAll(`${scope} canvas`)) {
      const chart = Chart.getChart(canvas);
      if (!chart) continue;
      const labels = (chart.data.labels ?? []).map(year);
      const sets = chart.data.datasets;
      if (labels.length > 0 && labels.every((y) => y >= 2000 && y < 2100)) {
        // Waves along the axis: each dataset is a line.
        for (const d of sets) out.push(Object.fromEntries(labels.map((y, i) => [y, d.data[i]])));
      } else if (sets.length > 0 && sets.every((d) => /^20\d\d/.test(String(d.label)))) {
        // A grid: rows along the axis, a dataset per wave; each row is a line.
        for (let i = 0; i < labels.length; i += 1) out.push(Object.fromEntries(sets.map((d) => [year(d.label), d.data[i]])));
      }
    }
    return out;
  }, scope);
  const near = (a, b) => typeof a === 'number' && Math.abs(a - b) <= 0.55 + 1e-9;
  let explored = 0;
  for (const t of tilesAt[1280].filter((tile) => tile.pills.length === 2)) {
    const H = Number(t.headline.replace('%', ''));
    const [first, recent] = t.pills.map((p) => p.text.match(PILL)).map((m) => ({ pts: Number(m[1]), from: Number(m[2]) }));
    const to = Number(t.label.match(/ in (\d{4}),/)?.[1]);
    const matches = (s) => near(s[to], H)
      && typeof s[first.from] === 'number' && near(s[to] - s[first.from], first.pts)
      && typeof s[recent.from] === 'number' && near(s[to] - s[recent.from], recent.pts);
    await page.goto(`${BASE}/#/theme/${t.slug}`);
    await page.waitForTimeout(1500);
    let found = (await lines('.chart-cell')).some(matches);
    if (!found) {
      const theme = content.themes.find((th) => th.slug === t.slug);
      const pies = (theme?.charts ?? []).filter((c) => c.comparison === 'tracked' && c.type === 'pie');
      for (const chart of pies) {
        explored += 1;
        await page.goto(`${BASE}/#/explore?q=${chart.questions[0]}&chart=line`);
        await page.waitForTimeout(800);
        if ((await lines('.explorer-figure')).some(matches)) { found = true; break; }
      }
    }
    if (!found) unmatched.push([t.slug, t.headline, t.pills.map((p) => p.text)]);
  }
  check(`each two-pill tile's headline and both changes match a line its theme page draws, or for a pie, Explore's line of its question (${explored} looked up there)`,
    unmatched.length === 0, unmatched);
  await page.close();
}

// ---- Methodology ---------------------------------------------------------------------------
{
  const page = await open(1280, '#/methodology');
  const m = await page.evaluate(() => {
    const sec = document.getElementById('m-regions');
    const fw = document.getElementById('m-fieldwork');
    const rows = (root) => [...(root?.querySelectorAll('tbody tr') ?? [])].map((tr) => [...tr.children].map((c) => c.textContent.trim()));
    return {
      groups: [...(sec?.querySelectorAll('[data-region]') ?? [])].map((box) => [
        box.querySelector('h3')?.textContent ?? '', [...box.querySelectorAll('li')].map((li) => li.textContent)]),
      regionsText: sec?.textContent ?? '',
      au: [...(sec?.querySelectorAll('a') ?? [])].map((a) => [a.getAttribute('href'), a.textContent]),
      ungrouped: Boolean(document.querySelector('[data-ungrouped]')),
      overview: rows(document.getElementById('m-overview')),
      fieldwork: rows(fw),
      fieldworkText: fw?.textContent ?? '',
      page: document.body.textContent,
    };
  });
  const want = byRegion(content.countries);
  check('Methodology lists the African Union\'s regions, in its order, each with its countries alphabetically, every country in one',
    JSON.stringify(m.groups) === JSON.stringify(want) && m.groups.flatMap(([, c]) => c).length === 28, { page: m.groups, want });
  check('no Northern region is listed (the survey has no country in it)', !m.groups.some(([r]) => r === 'Northern'), m.groups.map(([r]) => r));
  check('the regions are credited to the African Union, linked to its member states page, and not to PSB',
    m.au.some(([href, text]) => href === AU_URL && text === 'African Union') && !/PSB gave|grouping PSB/i.test(m.regionsText), { au: m.au });
  check('the note on earlier-wave markets with "no agreed region yet" is gone',
    !m.ungrouped && !/no agreed region/i.test(m.page), m.ungrouped);
  const interviews = m.overview.find(([term]) => term === 'Interviews')?.[1] ?? null;
  const published = Object.values(fieldwork.waves).reduce((s, w) => s + (w.published ?? 0), 0);
  check('the Study overview\'s Interviews row no longer says "(file count; no published total)"',
    interviews === `${n(published)} published, 2020 to 2024 · ${n(fieldwork.waves[String(latest)].interviews)} in ${latest}`, interviews);
  const rowOf = Object.fromEntries(m.fieldwork.map(([name, , languages, locations]) => [name, { languages, locations }]));
  const spellings = SPELLINGS.filter(([country, column, now, was]) => !rowOf[country]?.[column]?.includes(now) || was.test(rowOf[country]?.[column] ?? ''));
  check('Michael\'s five spellings are corrected: Kribi, N\'Djamena and Sarh, Mombasa, Khartoum North, Kinyarwanda',
    spellings.length === 0, spellings.map(([c, col]) => [c, col, rowOf[c]?.[col]]));
  const round = ROUND.filter(([country, place, language]) => !rowOf[country]?.locations.includes(place) || !rowOf[country]?.languages.includes(language));
  check('Tanzania, Mali and Senegal read the right way round: places as locations, languages as languages',
    round.length === 0, round.map(([c]) => [c, rowOf[c]]));
  const shown = m.fieldwork.filter(([name, , languages, locations]) => languages !== fieldwork.countries[name]?.languages
    || locations !== fieldwork.countries[name]?.locations);
  check('every country\'s languages and locations are shown, as fieldwork.json has them: none awaited or being checked',
    m.fieldwork.length === 28 && shown.length === 0 && !/Awaited from PSB|Being checked with PSB/.test(m.fieldworkText), shown);
  check('the fieldwork says face to face in all four waves, and the old comment is gone',
    m.fieldworkText.includes(FACE_TO_FACE) && !/As supplied by PSB on 28 September|ask PSB to confirm|swapped columns|national or urban/.test(m.fieldworkText),
    m.fieldworkText.slice(-400));
  // The map's country panel, for every country: its Region row is its African Union region.
  const panels = await page.evaluate(async () => {
    const { Chart } = await import('/src/charts/setup.ts');
    const chart = Chart.getChart(document.querySelector('.method-map canvas'));
    if (!chart) return null;
    const names = chart.data.labels;
    const out = {};
    for (let i = 0; i < names.length; i += 1) {
      chart.options.onClick?.(null, [{ index: i }], chart);
      const title = document.querySelector('.country-detail h2')?.textContent;
      const dts = [...document.querySelectorAll('.country-detail dt')];
      const region = dts.find((dt) => dt.textContent === 'Region')?.nextElementSibling?.textContent ?? null;
      if (title === names[i]) out[title] = region;
    }
    return out;
  });
  const panelWrong = content.countries.filter((c) => panels?.[c.name] !== c.region);
  check('the map\'s country panel names each country\'s African Union region',
    panels !== null && panelWrong.length === 0, panelWrong.map((c) => [c.name, panels?.[c.name] ?? null, c.region]));
  await page.close();
}

// ---- Explore -------------------------------------------------------------------------------
{
  const page = await open(1280, '#/explore');
  const field = () => page.evaluate(() => {
    const label = [...document.querySelectorAll('label.field')].find((l) => l.querySelector('span')?.textContent === 'Region');
    const select = label?.querySelector('select');
    const trigger = [...document.querySelectorAll('.picker-trigger')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Country:'));
    return {
      options: select ? [...select.options].map((o) => o.value).filter(Boolean) : null,
      first: select?.options[0]?.textContent ?? null,
      value: select?.value ?? null,
      countries: trigger ? trigger.getAttribute('aria-label').replace(/^Country: /, '') : null,
      pills: [...document.querySelectorAll('.ftag')].map((b) => b.textContent.replace('×', '').trim()),
      hash: location.hash,
    };
  });
  const offered = {};
  for (const year of years) {
    await page.goto(`${BASE}/#/explore?wave=${year}`);
    await page.waitForTimeout(700);
    offered[year] = (await field()).options;
  }
  const wantOffered = Object.fromEntries(years.map((y) => [y, byRegion(inWave(y)).map(([r]) => r)]));
  check('the Region field offers, in every wave, the African Union regions of the countries surveyed in it, earlier waves included, and never Northern',
    JSON.stringify(offered) === JSON.stringify(wantOffered) && Object.values(offered).every((o) => o.length > 0 && !o.includes('Northern')),
    { offered, wantOffered });
  for (const [region, year] of [['Southern', 2020], ['Western', 2022]]) {
    await page.goto(`${BASE}/#/explore?wave=${year}`);
    await page.waitForTimeout(700);
    await page.evaluate((region) => {
      const label = [...document.querySelectorAll('label.field')].find((l) => l.querySelector('span')?.textContent === 'Region');
      const select = label.querySelector('select');
      select.value = region;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, region);
    await page.waitForTimeout(900);
    const now = await field();
    const want = inWave(year).filter((c) => c.region === region).map((c) => c.name);
    const chosen = now.countries === null ? [] : now.countries.split(', ');
    check(`choosing ${region} in ${year} selects exactly its countries surveyed in ${year} (${want.length}), and shows "${region} region"`,
      want.length > 0 && now.value === region && JSON.stringify([...chosen].sort()) === JSON.stringify([...want].sort())
        && now.pills.includes(`${region} region`) && now.hash.includes(`region=${region}`),
      { now, want });
    // The choice stays: reading the link back gives the same choice (the old THE-254 snap-back).
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const again = await field();
    check(`${region} in ${year} stays chosen when the page is reopened from its link`,
      again.value === region && JSON.stringify(again.countries?.split(', ').sort()) === JSON.stringify([...want].sort()), again);
  }
  const first = await field();
  check('the Region field\'s default reads "All regions"', first.first === 'All regions', first.first);
  await page.close();
}

check('no page errors', errors.length === 0, errors);
await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
