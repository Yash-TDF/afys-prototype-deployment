// Drawing. One entry point — `renderFigure` — which produces the canvas, the
// caption furniture, and the table that carries the same figures.
//
// The table is not optional and it is not a nicety. Chart.js draws to a canvas,
// which a screen reader cannot see at all: without it, every figure on this site
// is invisible to part of the audience. It is also a contracted chart type in its
// own right, so the markup is owed twice over.
import type { ChartConfiguration, ChartType as ChartJsType } from 'chart.js';
import type { ChartType } from '../content';
import type { ViewModel } from '../model';
import { GRID, NO_DATA, ramp, SCALE_3, SCALE_4, SERIES } from './palette';
import { Chart, registerGeo, setupCharts, valueLabels } from './setup';

type FeatureLike = { properties: { name: string; surveyName: string | null } };

let africa: Promise<{ features: FeatureLike[] }> | null = null;

/** The Africa outline, fetched once and shared. 12 KB gzipped, so it is cheap to keep. */
function outline(): Promise<{ features: FeatureLike[] }> {
  africa ??= fetch('africa.geo.json').then((r) => {
    if (!r.ok) throw new Error(`africa.geo.json ${r.status}`);
    return r.json();
  });
  return africa;
}

const palette = (model: ViewModel, kind: ChartType): string[] => {
  if (model.series.length > 1) {
    return Array.from({ length: model.series.length }, (_, i) => SERIES[i % SERIES.length]!);
  }
  const count = model.categories.length;
  // Countries ranked against each other are one measurement, so one colour. So is
  // a long list of options — eight events cycling four colours reads as four
  // pairs, which is a grouping the data does not have. Only a short answer scale,
  // where the colours carry direction, earns several.
  if (model.categoryKind === 'countries' || count > 5) {
    return Array.from({ length: count }, () => SERIES[0]!);
  }
  return Array.from({ length: count }, (_, i) => (count <= 3 ? SCALE_3 : SCALE_4)[i % (count <= 3 ? SCALE_3 : SCALE_4).length]!);
};

function baseConfig(model: ViewModel, kind: ChartType): ChartConfiguration {
  const multiSeries = model.series.length > 1;
  const colours = palette(model, kind);
  const many = model.categories.length > 8;

  const datasets = model.series.map((s, i) => ({
    label: s.label,
    data: s.values,
    backgroundColor: multiSeries ? colours[i] : colours,
    borderColor: multiSeries ? colours[i] : colours,
    borderWidth: kind === 'line' ? 2 : 0,
    borderRadius: kind === 'bar' || kind === 'hbar' ? 3 : 0,
    tension: 0.3,
    pointRadius: 3,
    fill: false,
  }));

  const percentAxis = {
    beginAtZero: true,
    max: 100,
    grid: { color: GRID },
    ticks: { callback: (v: string | number) => `${v}%` },
  };
  const categoryAxis = {
    grid: { display: false },
    ticks: {
      autoSkip: false,
      maxRotation: many ? 60 : 0,
      // Real answer options are long — "Increased access to essential services
      // and resources". Chart.js clips them silently at the edge of the canvas,
      // which loses the start of the label rather than the end. Truncate
      // deliberately instead; the table underneath carries the full wording.
      callback(this: { getLabelForValue(v: number): string }, value: number) {
        const label = this.getLabelForValue(value);
        return label.length > 34 ? `${label.slice(0, 33)}…` : label;
      },
    },
  };

  const shared = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: multiSeries || kind === 'pie', position: 'bottom' as const },
    },
  };

  switch (kind) {
    case 'hbar':
      return {
        type: 'bar',
        data: { labels: model.categories, datasets },
        options: { ...shared, indexAxis: 'y', scales: { x: percentAxis, y: categoryAxis } },
        plugins: [valueLabels],
      } as ChartConfiguration;
    case 'line':
      return {
        type: 'line',
        data: { labels: model.categories, datasets },
        options: { ...shared, scales: { y: percentAxis, x: categoryAxis } },
      } as ChartConfiguration;
    case 'stacked':
      return {
        type: 'bar',
        data: { labels: model.categories, datasets },
        options: {
          ...shared,
          indexAxis: 'y',
          scales: { x: { ...percentAxis, stacked: true }, y: { ...categoryAxis, stacked: true } },
        },
        plugins: [valueLabels],
      } as ChartConfiguration;
    case 'pie':
      return {
        type: 'pie',
        data: { labels: model.categories, datasets },
        options: { ...shared, cutout: '52%' },
      } as ChartConfiguration;
    default:
      return {
        type: 'bar',
        data: { labels: model.categories, datasets },
        options: { ...shared, scales: { y: percentAxis, x: categoryAxis } },
        plugins: many ? [] : [valueLabels],
      } as ChartConfiguration;
  }
}

async function mapConfig(model: ViewModel, accent: string): Promise<ChartConfiguration> {
  const [geo] = await Promise.all([outline(), registerGeo()]);
  const values = new Map(model.categories.map((name, i) => [name, model.series[0]?.values[i] ?? null]));
  const features = geo.features;
  const stops = ramp(accent);

  return {
    type: 'choropleth' as unknown as ChartJsType,
    data: {
      labels: features.map((f) => f.properties.surveyName ?? f.properties.name),
      datasets: [{
        label: model.showing ?? model.title,
        outline: features,
        // A country the survey has never covered is not a zero. It is drawn in the
        // no-data grey and says "not surveyed" on hover.
        data: features.map((f) => ({
          feature: f,
          value: values.get(f.properties.surveyName ?? '') ?? null,
        })),
        borderColor: '#ffffff',
        borderWidth: 0.5,
      }],
    } as unknown as ChartConfiguration['data'],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      showOutline: true,
      showGraticule: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: { raw: unknown }) => {
              const raw = ctx.raw as {
                feature: { properties: { surveyName: string | null; name: string } };
                value: number | null;
              };
              const name = raw.feature.properties.surveyName ?? raw.feature.properties.name;
              return raw.value === null ? `${name} — not surveyed` : `${name}: ${raw.value}%`;
            },
          },
        },
      },
      scales: {
        projection: { axis: 'x', projection: 'equalEarth' },
        color: {
          axis: 'x',
          quantize: 5,
          missing: NO_DATA,
          interpolate: (t: number) => stops[Math.min(stops.length - 1, Math.floor(t * stops.length))]!,
          legend: { position: 'bottom-left', align: 'bottom', length: 110, width: 8 },
        },
      },
    } as unknown as ChartConfiguration['options'],
  };
}

function table(model: ViewModel): HTMLDetailsElement {
  const wrap = document.createElement('details');
  wrap.className = 'chart-table';
  const summary = document.createElement('summary');
  summary.textContent = 'View as a table';
  wrap.append(summary);

  const el = document.createElement('table');
  const caption = document.createElement('caption');
  caption.textContent = `${model.title} — illustrative figures, base ${model.base} respondents`;
  el.append(caption);

  const head = document.createElement('tr');
  const corner = document.createElement('th');
  corner.scope = 'col';
  corner.textContent = model.series.length > 1 ? 'Wave' : 'Category';
  head.append(corner);
  for (const s of model.series) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = s.label;
    head.append(th);
  }
  el.append(head);

  model.categories.forEach((category, i) => {
    const row = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = category;
    row.append(th);
    for (const s of model.series) {
      const td = document.createElement('td');
      const value = s.values[i];
      td.textContent = value === undefined ? '—' : `${value}%`;
      row.append(td);
    }
    el.append(row);
  });

  wrap.append(el);
  return wrap;
}

/** A one-sentence description of the chart, for anyone who cannot see it. */
function summarise(model: ViewModel, kind: ChartType): string {
  const values = model.series.flatMap((s) => s.values);
  const low = Math.min(...values);
  const high = Math.max(...values);
  return `${kind === 'map' ? 'Map' : 'Chart'}: ${model.title}. `
    + `${model.series.length} series across ${model.categories.length} categories, `
    + `ranging from ${low}% to ${high}%. Illustrative figures. `
    + 'The same values follow as a table.';
}

function notes(model: ViewModel): string[] {
  const out: string[] = [];
  if (model.likeForLike) out.push(model.likeForLike);
  out.push(...model.caveats);
  if (model.optionsInvented) {
    out.push(
      'Response options on this chart are placeholders — the deck does not record '
      + 'them. The real list is one of the things we need from PSB.',
    );
  }
  out.push(`Base: ${model.base} respondents (illustrative).`);
  return out;
}

export interface Figure { destroy(): void }

export function renderFigure(
  host: HTMLElement,
  model: ViewModel,
  kind: ChartType,
  accent: string,
): Figure {
  setupCharts();
  host.replaceChildren();

  const figure = document.createElement('figure');
  figure.className = 'chart';

  const head = document.createElement('figcaption');
  const title = document.createElement('h3');
  title.textContent = model.title;
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.textContent = 'Illustrative';
  head.append(title, chip);
  if (model.showing) {
    const showing = document.createElement('p');
    showing.className = 'showing';
    showing.textContent = model.showing;
    head.append(showing);
  }
  figure.append(head);

  let chart: Chart | undefined;

  if (kind === 'table') {
    const only = table(model);
    only.open = true;
    only.querySelector('summary')?.remove();
    figure.append(only);
  } else {
    const canvasWrap = document.createElement('div');
    canvasWrap.className = kind === 'map' ? 'canvas canvas-map' : 'canvas';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', summarise(model, kind));
    canvasWrap.append(canvas);
    figure.append(canvasWrap);

    if (kind === 'map') {
      void mapConfig(model, accent).then((config) => {
        chart = new Chart(canvas, config);
      });
    } else {
      chart = new Chart(canvas, baseConfig(model, kind));
    }
    figure.append(table(model));
  }

  for (const note of notes(model)) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = note;
    figure.append(p);
  }

  host.append(figure);
  return { destroy: () => chart?.destroy() };
}
