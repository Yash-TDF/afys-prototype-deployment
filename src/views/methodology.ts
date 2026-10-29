// The methodology view: one page for what this survey is.
//
// It answers one question: who was actually asked, and when. That is the question
// behind almost every complaint a data portal receives, and the map is the
// fastest way to answer it. A country that was never surveyed is grey and says
// so; it is never a zero.
//
// It also holds what the "About the data" drawer used to hold (the study
// overview and the figures note), because the client asked for one Methodology
// page rather than two homes for the same facts; the drawer's list of themes and
// question counts was the part they did not want, and it is gone. Everything the
// drawer said about countries and waves is said here once, from the same data.
//
// The interview counts, languages and locations come from `fieldwork` (see
// content.ts): counted from the delivered survey file and supplied by PSB. They
// are the only figures on the site that are not illustrative, and the page says
// which they are. The regions are the African Union's, from the portal's seed
// (src/regions.ts), credited to it as PSB asked (THE-417).
import { countries, fieldwork, inWave, latestWave, waves, type Country } from '../content';
import { Chart, registerGeo } from '../charts/setup';
import { BRAND, mix, NO_DATA } from '../charts/palette';
import { REGION_SOURCE, REGIONS } from '../regions';
import { inWords } from '../ui/format';
import { showWave } from '../wave-badge';

type FeatureLike = { properties: { name: string; surveyName: string | null; waves: number[] } };

// Every country has its languages and locations since PSB's sheet of 30 Sep; kept for one without.
const AWAITED = 'Awaited from PSB';
// Every seeded country has a region today; the portal's words for one without.
const UNGROUPED = 'To be added';
const n = (value: number): string => value.toLocaleString('en-GB');

/** PSB's published total across the waves they have published one for. */
const publishedTotal = (): number =>
  Object.values(fieldwork.waves).reduce((sum, w) => sum + (w.published ?? 0), 0);

/** Interviews achieved in a country in a wave, or null if it was not asked. */
const achieved = (country: string, year: number): number | null =>
  fieldwork.countries[country]?.interviews[String(year)] ?? null;

export function methodologyView(host: HTMLElement, params?: URLSearchParams): { destroy(): void; update(params: URLSearchParams): void } {
  let wave = waves[waves.length - 1]!.year;
  let chart: Chart | undefined;

  host.replaceChildren();

  const head = document.createElement('section');
  head.className = 'method-header an';
  const h1 = document.createElement('h1');
  h1.textContent = 'Who was asked';
  const lede = document.createElement('p');
  lede.textContent =
    'The African Youth Survey interviews people aged 18 to 24. Coverage has changed '
    + 'from wave to wave, so a country missing from a chart was not asked that year — '
    + 'it is not a result of zero.';
  head.append(h1, lede);
  host.append(head);

  host.append(section('overview', 'Study overview', overview(), 'text-table an a1'));

  const toggle = document.createElement('div');
  toggle.className = 'type-switch an a1';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Wave');
  host.append(toggle);

  const mapHolder = document.createElement('div');
  mapHolder.className = 'method-map';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  mapHolder.append(canvas);

  const detail = document.createElement('aside');
  detail.className = 'country-detail';
  // Its content changes on a map click; a screen reader is told, without being interrupted.
  detail.setAttribute('aria-live', 'polite');

  const layout = document.createElement('div');
  layout.className = 'method-layout an a2';
  layout.append(mapHolder, detail);
  host.append(layout);

  // Each section lands a beat after the one before, as the landing's cards do.
  host.append(section('coverage', 'Coverage and interviews by wave', coverageTable(), 'an a3'));
  host.append(section('regions', 'Regions', regions(), 'an a4'));
  host.append(section('fieldwork', 'Languages and locations', fieldworkTable(), 'text-table an a5'));

  const showCountry = (country: Country | null): void => {
    detail.replaceChildren();
    const title = document.createElement('h2');
    title.textContent = country ? country.name : 'Select a country';
    detail.append(title);
    if (!country) {
      const hint = document.createElement('p');
      hint.textContent = 'Click a country on the map to see which waves it appears in, how many people were interviewed, and in which languages and places.';
      detail.append(hint);
      return;
    }
    const list = document.createElement('ul');
    for (const w of waves) {
      const item = document.createElement('li');
      const count = achieved(country.name, w.year);
      item.className = count !== null ? 'asked' : 'not-asked';
      item.textContent = count !== null ? `${w.year} — ${n(count)} interviews` : `${w.year} — not surveyed`;
      list.append(item);
    }
    detail.append(list);

    const facts = fieldwork.countries[country.name];
    const dl = document.createElement('dl');
    const row = (term: string, value: string | null | undefined, missing: string): void => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = value ?? missing;
      if (!value) dd.className = 'awaited';
      dl.append(dt, dd);
    };
    row('Region', country.region, UNGROUPED);
    row('Languages', facts?.languages, AWAITED);
    row('Locations', facts?.locations, AWAITED);
    detail.append(dl);
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent =
      'Interviews are unweighted counts from the delivered survey file. Languages and locations are as supplied by PSB.';
    detail.append(note);
  };

  const drawToggle = (): void => {
    showWave(wave);
    toggle.replaceChildren();
    for (const w of waves) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${w.year} · ${inWave(w.year).length} countries`;
      button.className = w.year === wave ? 'active' : '';
      button.setAttribute('aria-pressed', String(w.year === wave));
      button.addEventListener('click', () => { wave = w.year; void drawMap(); drawToggle(); });
      toggle.append(button);
    }
  };

  const drawMap = async (): Promise<void> => {
    const [geo] = await Promise.all([
      fetch('africa.geo.json').then((r) => r.json()) as Promise<{ features: FeatureLike[] }>,
      registerGeo(),
    ]);
    const features = geo.features;
    chart?.destroy();

    canvas.setAttribute(
      'aria-label',
      `Map of Africa. ${inWave(wave).length} countries surveyed in ${wave}, `
      + 'shown in the theme colour; the rest are grey and were not surveyed. '
      + 'The same information follows as a table.',
    );

    chart = new Chart(canvas, {
      // 1 = surveyed in this wave, 0 = surveyed in another wave, null = never.
      type: 'choropleth' as never,
      data: {
        labels: features.map((f) => f.properties.surveyName ?? f.properties.name),
        datasets: [{
          label: `Surveyed in ${wave}`,
          outline: features,
          data: features.map((f) => ({
            feature: f,
            value: f.properties.waves.includes(wave) ? 1 : f.properties.waves.length > 0 ? 0.35 : null,
          })),
          borderColor: '#ffffff',
          borderWidth: 0.6,
        }],
      } as never,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        showOutline: true,
        showGraticule: false,
        onClick: (_event: unknown, elements: { index: number }[]) => {
          const hit = elements[0];
          if (!hit) return;
          const name = features[hit.index]?.properties.surveyName;
          showCountry(countries.find((c) => c.name === name) ?? null);
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: { raw: unknown }) => {
                const raw = ctx.raw as { feature: FeatureLike; value: number | null };
                const name = raw.feature.properties.surveyName ?? raw.feature.properties.name;
                if (raw.value === null) return `${name} — never surveyed`;
                if (raw.value === 1) {
                  const count = raw.feature.properties.surveyName ? achieved(raw.feature.properties.surveyName, wave) : null;
                  return count !== null ? `${name} — ${n(count)} interviews in ${wave}` : `${name} — surveyed in ${wave}`;
                }
                return `${name} — surveyed in ${raw.feature.properties.waves.join(', ')}, not ${wave}`;
              },
              afterBody: () => '',
            },
          },
        },
        scales: {
          projection: { axis: 'x', projection: 'equalEarth' },
          color: {
            axis: 'x',
            // The scale's own legend is a numeric ramp; this map has three named
            // categories, so it carries a written legend underneath instead.
            display: false,
            missing: NO_DATA,
            interpolate: (t: number) => (t > 0.6 ? BRAND.green : mix(BRAND.green, '#ffffff', 0.72)),
            legend: { display: false },
          },
        },
      } as never,
    });
  };

  const legend = document.createElement('ul');
  legend.className = 'map-legend';
  legend.innerHTML =
    '<li><span style="background:' + BRAND.green + '"></span>Surveyed in this wave</li>'
    + '<li><span style="background:' + mix(BRAND.green, '#ffffff', 0.72) + '"></span>Surveyed in another wave</li>'
    + '<li><span style="background:' + NO_DATA + '"></span>Never surveyed</li>';
  mapHolder.append(legend);

  drawToggle();
  showCountry(null);
  void drawMap();

  // A landing stat card lands on the section behind it: `?s=coverage`. Asked for
  // in script, `smooth` outranks the stylesheet's reduced-motion rule, so the
  // preference is read here as well. The section is marked, which says where you
  // were sent when the scroll position cannot.
  const landOn = (p: URLSearchParams | undefined): void => {
    const id = p?.get('s');
    if (!id) return;
    const target = host.querySelector(`#m-${CSS.escape(id)}`);
    if (!target) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const marked of host.querySelectorAll('.is-target')) marked.classList.remove('is-target');
    // After the route's own scroll to the top, which runs once this view is built.
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
      target.classList.add('is-target');
      // The wash is a transition, not an animation (see methodology.css): it fades
      // back once the class goes.
      window.setTimeout(() => target.classList.remove('is-target'), 1800);
    });
  };
  landOn(params);

  return { destroy: () => chart?.destroy(), update: landOn };
}

function section(id: string, heading: string, content: HTMLElement, className: string): HTMLElement {
  const wrap = document.createElement('section');
  // `coverage` is the card-and-table style chart.css already gives the coverage
  // table; every section here wears it so the page is one set of like tables.
  wrap.className = `method-sec coverage ${className}`;
  // Matched by id, not by reading the heading back, so renaming a heading cannot
  // silently send a stat card nowhere.
  wrap.id = `m-${id}`;
  const h = document.createElement('h2');
  h.id = `m-${id}-heading`;
  h.textContent = heading;
  wrap.append(h, content);
  // Each table is named by the heading above it, for a reader moving by table.
  for (const table of wrap.querySelectorAll('table')) table.setAttribute('aria-labelledby', h.id);
  return wrap;
}

function overview(): HTMLElement {
  // The published total, 2020 to 2024, is PSB's own figure; the 2026 count is
  // ours from the file and has no published total to stand against yet. PSB asked
  // on 22 Oct for the row not to say so (THE-417).
  const latest = fieldwork.waves[String(latestWave)];
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  const rows: [string, string][] = [
    ['Respondents', 'Aged 18 to 24'],
    ['Countries', `${countries.length} across ${waves.length} waves`],
    ['Latest wave', `${latestWave} · ${inWave(latestWave).length} countries`],
    ['Interviews', `${n(publishedTotal())} published, 2020 to 2024 · ${n(latest?.interviews ?? 0)} in ${latestWave}`],
    ['Fielded by', 'PSB Insights'],
  ];
  for (const [term, value] of rows) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = term;
    const td = document.createElement('td');
    td.className = 'value';
    td.textContent = value;
    tr.append(th, td);
    tbody.append(tr);
  }
  table.append(tbody);
  return table;
}

/**
 * Every country against every wave: the interviews achieved, or a dash. Under
 * the countries, the wave totals against what PSB has published. The counts are
 * unweighted; published figures weight every market equally, which is why South
 * Africa's 1,046 in 2024 is shown as a count and not as a share of anything.
 */
function coverageTable(): HTMLElement {
  const wrap = document.createElement('div');
  const el = document.createElement('table');
  const thead = document.createElement('thead');
  const head = document.createElement('tr');
  head.innerHTML = '<th scope="col">Country</th>';
  for (const w of waves) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = String(w.year);
    head.append(th);
  }
  thead.append(head);
  const tbody = document.createElement('tbody');
  el.append(thead, tbody);
  for (const country of [...countries].sort((a, b) => a.name.localeCompare(b.name))) {
    const row = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = country.name;
    row.append(th);
    for (const w of waves) {
      const td = document.createElement('td');
      const count = achieved(country.name, w.year);
      td.textContent = count !== null ? n(count) : '—';
      td.className = count !== null ? 'yes count' : 'no';
      row.append(td);
    }
    tbody.append(row);
  }
  const tfoot = document.createElement('tfoot');
  const totals = document.createElement('tr');
  totals.className = 'total';
  totals.innerHTML = '<th scope="row">Interviews</th>';
  const published = document.createElement('tr');
  published.className = 'published';
  published.innerHTML = '<th scope="row">Published</th>';
  const note = document.createElement('p');
  note.className = 'note';
  note.id = 'm-coverage-note';
  const queries: string[] = [];
  for (const w of waves) {
    const fw = fieldwork.waves[String(w.year)];
    const td = document.createElement('td');
    td.textContent = fw ? n(fw.interviews) : '—';
    // A count that is open with PSB, or differs from the published total, is
    // marked in colour and in text, and points at the note that says why.
    const open = fw?.query ?? null;
    const differs = fw?.published !== null && fw?.published !== undefined && fw.interviews !== fw.published;
    if (fw && (open || differs)) {
      td.className = 'count flag';
      const mark = document.createElement('sup');
      mark.textContent = '†';
      mark.setAttribute('aria-hidden', 'true');
      td.append(' ', mark);
      const said = document.createElement('span');
      said.className = 'sr-only';
      said.textContent = ' (being checked with PSB)';
      td.append(said);
      td.setAttribute('aria-describedby', note.id);
      queries.push(`${w.year}: ${open ?? `differs from the published ${n(fw.published ?? 0)}.`}`);
    }
    totals.append(td);
    const tp = document.createElement('td');
    tp.textContent = fw?.published !== null && fw?.published !== undefined ? n(fw.published) : '—';
    published.append(tp);
  }
  tfoot.append(totals, published);
  el.append(tfoot);
  wrap.append(el);

  note.textContent =
    'Interviews are the unweighted counts achieved in each country, taken from the delivered survey file. '
    + 'Published figures are weighted so that every market counts equally, whatever its sample: South Africa’s '
    + `${n(achieved('South Africa', 2024) ?? 0)} interviews in 2024 do not weigh more than a market’s 300. `
    + `† ${queries.join(' ')} ${latestWave} has no published total yet.`;
  wrap.append(note);
  return wrap;
}

/**
 * The African Union's regions, every country of every wave in one, credited to the African Union
 * with its own page, as PSB asked on 22 Oct (THE-417). Never credited to PSB.
 */
function regions(): HTMLElement {
  const wrap = document.createElement('div');
  const grid = document.createElement('div');
  grid.className = 'region-grid';
  const alphabetically = (list: Country[]): string[] => list.map((c) => c.name).sort((a, b) => a.localeCompare(b));
  for (const region of REGIONS) {
    const box = document.createElement('div');
    box.className = 'region';
    box.setAttribute('data-region', region);
    const h3 = document.createElement('h3');
    h3.textContent = region;
    const ul = document.createElement('ul');
    for (const name of alphabetically(countries.filter((c) => c.region === region))) {
      const li = document.createElement('li');
      li.textContent = name;
      ul.append(li);
    }
    box.append(h3, ul);
    grid.append(box);
  }
  wrap.append(grid);
  // Every seeded country has a region today. One without is named here, as its panel on the map
  // says "To be added", rather than missing from the list without a word (review of #35).
  const unplaced = alphabetically(countries.filter((c) => !c.region));
  if (unplaced.length > 0) {
    const none = document.createElement('p');
    none.className = 'note';
    none.setAttribute('data-no-region', '');
    none.textContent = `Region to be added: ${unplaced.join(', ')}.`;
    wrap.append(none);
  }
  // The portal's wording (RegionTable, THE-414).
  const note = document.createElement('p');
  note.className = 'note';
  const source = document.createElement('a');
  source.href = REGION_SOURCE.url;
  source.rel = 'noopener noreferrer';
  source.textContent = REGION_SOURCE.name;
  note.append('Regions as defined by the ', source, '. Explore can show any one of them.');
  wrap.append(note);
  return wrap;
}

/**
 * Languages and locations per country, as PSB supplied them on 30 Sep with the spellings they
 * corrected on 22 Oct (tools/build-fieldwork.py); a gap is said, not filled.
 */
function fieldworkTable(): HTMLElement {
  const wrap = document.createElement('div');
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th scope="col">Country</th><th scope="col">Waves</th><th scope="col">Languages</th><th scope="col">Locations</th></tr>';
  const tbody = document.createElement('tbody');
  for (const country of [...countries].sort((a, b) => a.name.localeCompare(b.name))) {
    const facts = fieldwork.countries[country.name];
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = country.name;
    const tdWaves = document.createElement('td');
    tdWaves.className = 'waves';
    tdWaves.textContent = country.waves.join(', ');
    const cell = (value: string | null | undefined): HTMLTableCellElement => {
      const td = document.createElement('td');
      td.textContent = value ?? AWAITED;
      if (!value) td.className = 'awaited';
      return td;
    };
    tr.append(th, tdWaves, cell(facts?.languages), cell(facts?.locations));
    tbody.append(tr);
  }
  table.append(thead, tbody);
  wrap.append(table);
  // PSB's answer of 22 Oct, in place of the note that asked: "All interviews face to face in all
  // waves. … Please update and remove comment."
  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = `All interviews were face to face, in all ${inWords(waves.length)} waves.`;
  wrap.append(note);
  return wrap;
}

