// The methodology view — the second page the prototype does not have.
//
// It answers one question: who was actually asked, and when. That is the question
// behind almost every complaint a data portal receives, and the map is the
// fastest way to answer it. A country that was never surveyed is grey and says
// so; it is never a zero.
import { countries, inWave, waves, type Country } from '../content';
import { Chart, registerGeo } from '../charts/setup';
import { BRAND, mix, NO_DATA } from '../charts/palette';

type FeatureLike = { properties: { name: string; surveyName: string | null; waves: number[] } };

export function methodologyView(host: HTMLElement): () => void {
  let wave = waves[waves.length - 1]!.year;
  let chart: Chart | undefined;

  host.replaceChildren();

  const head = document.createElement('section');
  head.className = 'method-header an';
  const h1 = document.createElement('h1');
  h1.textContent = 'Who was asked';
  const lede = document.createElement('p');
  lede.textContent =
    'The African Youth Survey interviews people aged 18 to 24. Coverage has grown '
    + 'with each wave, so a country missing from a chart was not asked that year — '
    + 'it is not a result of zero.';
  head.append(h1, lede);
  host.append(head);

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

  const layout = document.createElement('div');
  layout.className = 'method-layout an a2';
  layout.append(mapHolder, detail);
  host.append(layout);

  const table = document.createElement('section');
  table.className = 'coverage an a3';
  host.append(table);

  const showCountry = (country: Country | null): void => {
    detail.replaceChildren();
    const title = document.createElement('h2');
    title.textContent = country ? country.name : 'Select a country';
    detail.append(title);
    if (!country) {
      const hint = document.createElement('p');
      hint.textContent = 'Click a country on the map to see which waves it appears in.';
      detail.append(hint);
      return;
    }
    const list = document.createElement('ul');
    for (const w of waves) {
      const item = document.createElement('li');
      const asked = country.waves.includes(w.year);
      item.className = asked ? 'asked' : 'not-asked';
      item.textContent = `${w.year} — ${asked ? 'surveyed' : 'not surveyed'}`;
      list.append(item);
    }
    detail.append(list);
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = 'Sample sizes arrive with the survey files.';
    detail.append(note);
  };

  const drawTable = (): void => {
    table.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = 'Coverage by wave';
    const el = document.createElement('table');
    const head2 = document.createElement('tr');
    head2.innerHTML = '<th scope="col">Country</th>';
    for (const w of waves) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = String(w.year);
      head2.append(th);
    }
    el.append(head2);
    for (const country of [...countries].sort((a, b) => a.name.localeCompare(b.name))) {
      const row = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = country.name;
      row.append(th);
      for (const w of waves) {
        const td = document.createElement('td');
        const asked = country.waves.includes(w.year);
        td.textContent = asked ? 'Yes' : '—';
        td.className = asked ? 'yes' : 'no';
        row.append(td);
      }
      el.append(row);
    }
    table.append(heading, el);
  };

  const drawToggle = (): void => {
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
                if (raw.value === 1) return `${name} — surveyed in ${wave}`;
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
  drawTable();
  void drawMap();

  return () => chart?.destroy();
}
