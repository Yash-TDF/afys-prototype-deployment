// Drawing. One entry point — `renderFigure` — which produces the canvas, the
// caption furniture, and the table that carries the same figures.
//
// The table is not optional and it is not a nicety. Chart.js draws to a canvas,
// which a screen reader cannot see at all: without it, every figure on this site
// is invisible to part of the audience. It is also a contracted chart type in its
// own right, so the markup is owed twice over.
import type { ChartConfiguration, ChartType as ChartJsType } from 'chart.js';
import type { ChartType } from '../content';
import { type CategoryKind, type SeriesKind, type ViewModel, sharedBases } from '../model';
import { GRID, NO_DATA, OFF_SCALE, OFF_SCALE_LABEL, pieStops, ramp, SCALE_3, SCALE_4, SCALE_5, SERIES } from './palette';
import { Chart, registerGeo, setupCharts, valueLabels } from './setup';
import { badgeElement, sampleBadge } from '../ui/quality';
import { fmtPct } from '../ui/format';
import { insightRow } from '../ui/insights';

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

export const palette = (model: ViewModel, kind: ChartType, accent: string): string[] => {
  if (model.series.length > 1) {
    return Array.from({ length: model.series.length }, (_, i) => SERIES[i % SERIES.length]!);
  }
  const count = model.categories.length;
  // Countries ranked against each other are one measurement, so one colour. So is
  // a long list of options — eight events cycling four colours reads as four
  // pairs, which is a grouping the data does not have. Only a short answer scale,
  // where the colours carry direction, earns several.
  //
  // The one colour is the theme's own, which is the colour the choropleth ramp on
  // the same page already ends on. Twelve themes drawing in one green said the
  // charts belonged to the site rather than to the theme they sit in.
  if (model.categoryKind === 'countries' || count > 5) {
    // Except on a pie. A bar can spend sixteen bars on one colour because the
    // axis says which bar is which; a pie has no axis, so one colour there means
    // the chart says nothing at all — eight arcs in one green, and a legend of
    // eight identical dots.
    if (kind === 'pie') return pieStops(count);
    return Array.from({ length: count }, () => accent);
  }
  const scale = count <= 3 ? SCALE_3 : SCALE_4;
  // A five-point answer list is usually a four-point scale plus the answer that is
  // not on it. On a bar the fifth can take the first colour again, because the axis
  // says which bar is which. On a pie it cannot: the fifth slice touches the first,
  // so "Don't know" ends up the same green as "Very concerned" and the two read as
  // one wedge. Off the scale, off the scale's colours.
  //
  // Which slice that is comes from the label, not the position. T08_Q4 ends in
  // "Not at all" — no coverage at all, a real answer — and greying it by position
  // would have the chart report those people as having given none.
  if (kind === 'pie' && count > scale.length) {
    const offScale = model.categories.map((label) => OFF_SCALE_LABEL.test(label));
    const onScale = offScale.filter((off) => !off).length;
    // A list with a real answer in every position needs a colour in every
    // position. One that spends its last on "Don't know" keeps the four-point
    // scale it already had, so those five charts do not change.
    const steps = onScale > SCALE_4.length ? SCALE_5 : SCALE_4;
    let taken = 0;
    return model.categories.map((_, i) => (offScale[i] ? OFF_SCALE : steps[taken++] ?? OFF_SCALE));
  }
  return Array.from({ length: count }, (_, i) => scale[i % scale.length]!);
};

/** Width of a horizontal chart's label column: 205px, or 40% of a phone-width chart (under 400px). */
const labelColumn = (chartWidth: number): number => (chartWidth < 400 ? Math.round(chartWidth * 0.4) : 205);
/** 205px holds the 28 characters the labels are cut to, about 7.3px a character. */
const LABEL_CHAR_PX = 205 / 28;

/**
 * Stacking a comparison would be wrong, so it is not drawn that way.
 *
 * Each series in a comparison is its own distribution summing to 100; stacked on
 * one axis they reach 200. This is the only place that knows both the model and
 * the chart type, so the substitution belongs here rather than being asserted by
 * a model that cannot see which chart was asked for.
 */
const drawnAs = (model: ViewModel, kind: ChartType): ChartType =>
  (model.compare !== 'none' && kind === 'stacked' ? 'bar' : kind);

function baseConfig(model: ViewModel, requested: ChartType, accent: string): ChartConfiguration {
  const kind = drawnAs(model, requested);
  const horizontal = kind === 'hbar' || kind === 'stacked';
  const multiSeries = model.series.length > 1;
  const colours = palette(model, kind, accent);
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
    // Chart.js would otherwise allot the category axis a fraction of the canvas
    // and clip anything longer. Thirty characters of the body face at 12px needs
    // about this much. On a phone-width chart that would leave no room for the
    // bars themselves, so on a chart under 400px wide the column takes 40% of it.
    ...(horizontal ? {
      afterFit: (scale: { width: number; chart: { width: number } }) => {
        scale.width = labelColumn(scale.chart.width);
      },
    } : {}),
    // Sixteen country names turned to the 60° cap still overlap on a phone-width
    // chart. Stand them upright there; wider charts keep the angle Chart.js picks.
    ...(!horizontal && many ? {
      afterCalculateLabelRotation: (scale: { chart: { width: number }; labelRotation: number }) => {
        if (scale.chart.width < 400 && scale.labelRotation >= 60) scale.labelRotation = 90;
      },
    } : {}),
    ticks: {
      autoSkip: false,
      maxRotation: many ? 60 : 0,
      // Upright, 12px names are still a hair taller than their 14px slots at 360px.
      ...(!horizontal && many ? {
        font: (ctx: { chart: { width: number } }) => (ctx.chart.width < 400 ? { size: 11 } : undefined),
      } : {}),
      // Real answer options are long — "Increased access to essential services
      // and resources". Chart.js caps how much width it gives an axis and then
      // clips what does not fit, losing the *start* of the label, which is the
      // half that identifies it. Truncate deliberately from the end instead, and
      // below give the axis enough room for the length we truncate to. The table
      // underneath carries the full wording either way.
      callback(this: { getLabelForValue(v: number): string; chart: { width: number } }, value: number) {
        const label = this.getLabelForValue(value);
        const limit = horizontal ? Math.max(12, Math.floor(labelColumn(this.chart.width) / LABEL_CHAR_PX)) : 34;
        return label.length > limit ? `${label.slice(0, limit - 1)}…` : label;
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
              return raw.value === null ? `${name} — not surveyed` : `${name}: ${fmtPct(raw.value)}`;
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

/** What the first column holds. */
const CORNER: Record<CategoryKind, string> = {
  countries: 'Country',
  options: 'Response',
  waves: 'Wave',
};

/**
 * Which column the table is sorted by, and which way.
 *
 * Lives with the figure rather than in a module global. The prototype keeps its
 * sort column in one, and has to remember to reset it in four separate places —
 * opening a theme, rebuilding the question list, and each of previous and next.
 * Miss one and a sort chosen for the last question is silently applied to the
 * next question's rows.
 */
interface Sort { column: number; direction: 1 | -1 }

/** -1 is the category column; 0 and up are series; the base column is last. */
function sortRows(
  order: number[],
  column: number,
  direction: 1 | -1,
  model: ViewModel,
  bases: number[] | null,
): number[] {
  const value = (row: number): string | number | undefined => {
    if (column === -1) return model.categories[row];
    if (column === model.series.length) return bases?.[row];
    return model.series[column]?.values[row];
  };

  return [...order].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    // Absent sorts last whichever way the column points. A country nobody
    // surveyed must never float to the top of an ascending sort, where it reads
    // as the lowest figure rather than as no figure at all.
    if (left === undefined && right === undefined) return 0;
    if (left === undefined) return 1;
    if (right === undefined) return -1;
    if (typeof left === "string" && typeof right === "string") {
      return direction * left.localeCompare(right);
    }
    return direction * ((left as number) - (right as number));
  });
}

function table(model: ViewModel, colours: string[]): HTMLDetailsElement {
  const wrap = document.createElement('details');
  wrap.className = 'chart-table';
  const summary = document.createElement('summary');
  summary.textContent = 'View as a table';
  wrap.append(summary);

  const el = document.createElement('table');
  const caption = document.createElement('caption');
  caption.textContent = `${model.title} — illustrative figures, `
    + `base ${model.base.toLocaleString('en-GB')} respondents`;
  el.append(caption);

  // Only where the categories are separate samples, and only where every series
  // was measured on the same ones. See sharedBases.
  const bases = sharedBases(model);

  const headings: { label: string; column: number }[] = [
    { label: CORNER[model.categoryKind], column: -1 },
    ...model.series.map((s, i) => ({ label: s.label, column: i })),
    ...(bases ? [{ label: 'Base (n)', column: model.series.length }] : []),
  ];

  let sort: Sort | null = null;
  const body = document.createElement('tbody');
  const head = document.createElement('tr');

  for (const heading of headings) {
    const th = document.createElement('th');
    th.scope = 'col';
    // A real button inside the header, not a click handler on the th itself.
    // Theirs cannot be reached by keyboard and announces no state.
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sort-btn';
    button.append(heading.label);
    const caret = document.createElement('span');
    caret.className = 'sort-ind';
    caret.setAttribute('aria-hidden', 'true');
    button.append(caret);
    button.addEventListener('click', () => {
      sort = sort && sort.column === heading.column
        ? { column: heading.column, direction: sort.direction === 1 ? -1 : 1 }
        : { column: heading.column, direction: 1 };
      draw();
    });
    th.append(button);
    head.append(th);
  }

  function draw(): void {
    [...head.children].forEach((th, at) => {
      const heading = headings[at]!;
      const active = sort !== null && sort.column === heading.column;
      const ascending = active && sort!.direction === 1;
      th.classList.toggle('sorted', active);
      // aria-sort is the only thing that tells a screen reader the table is
      // ordered, and by which column.
      th.setAttribute('aria-sort', active ? (ascending ? 'ascending' : 'descending') : 'none');
      const caret = th.querySelector('.sort-ind');
      if (caret) caret.textContent = active ? (ascending ? '\u25b2' : '\u25bc') : '\u25be';
    });

    const natural = model.categories.map((_, i) => i);
    const order = sort === null
      ? natural
      : sortRows(natural, sort.column, sort.direction, model, bases);

    body.replaceChildren();
    for (const i of order) {
      const row = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = model.categories[i]!;
      row.append(th);
      model.series.forEach((s, series) => {
        const td = document.createElement('td');
        const value = s.values[i];
        td.textContent = value === undefined ? '—' : fmtPct(value);
        if (value !== undefined) {
          // The approved prototype draws a proportional bar under each figure,
          // which is what makes a column of numbers readable down the page. It is
          // decorative: the number it measures is already in the cell, so a screen
          // reader gains nothing from it and would only hear the same value twice.
          td.classList.add('bar-cell');
          const bar = document.createElement('div');
          bar.className = 'mini-bar';
          bar.style.width = `${Math.max(0, Math.min(100, value))}%`;
          // The series' own colour, rather than their three hardcoded classes:
          // they had exactly three series, we can have six.
          bar.style.setProperty('--bar-colour', colours[series % colours.length] ?? '');
          bar.setAttribute('aria-hidden', 'true');
          td.append(bar);
        }
        row.append(td);
      });
      if (bases) {
        const td = document.createElement('td');
        const n = bases[i];
        td.textContent = n === undefined ? '—' : n.toLocaleString('en-GB');
        row.append(td);
      }
      body.append(row);
    }
  }

  const header = document.createElement('thead');
  header.append(head);
  el.append(header, body);
  draw();

  wrap.append(el);
  return wrap;
}

/** What the series are, said out loud. Without it a gender split is announced as waves. */
const SPLIT: Record<SeriesKind, string> = {
  single: '',
  options: ', one per answer option',
  waves: ', one per wave',
  gender: ', compared by gender',
};

/** A one-sentence description of the chart, for anyone who cannot see it. */
function summarise(model: ViewModel, kind: ChartType): string {
  const values = model.series.flatMap((s) => s.values);
  const low = Math.min(...values);
  const high = Math.max(...values);
  return `${kind === 'map' ? 'Map' : 'Chart'}: ${model.title}. `
    + `${model.series.length} series${SPLIT[model.seriesKind]} `
    + `across ${model.categories.length} categories, `
    + `ranging from ${fmtPct(low)} to ${fmtPct(high)}. Illustrative figures. `
    + 'The same values follow as a table.';
}

function notes(model: ViewModel, requested: ChartType): string[] {
  const out: string[] = [];
  if (model.likeForLike) out.push(model.likeForLike);
  // A refused comparison is said, not swallowed.
  if (model.compareNote) out.push(model.compareNote);
  if (drawnAs(model, requested) !== requested) {
    out.push(
      'Each series is its own distribution, so they are drawn side by side rather '
      + 'than stacked — stacked they would total more than 100%.',
    );
  }
  out.push(...model.caveats);
  if (model.optionsInvented) {
    out.push(
      'Response options on this chart are placeholders — the deck does not record '
      + 'them. The real list is one of the things we need from PSB.',
    );
  }
  out.push(`Base: ${model.base.toLocaleString('en-GB')} respondents (illustrative).`);
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
  // Every figure here is generated, so the badge never grades the base — see
  // ui/quality.ts for why putting a margin of error on a hashed number would be
  // the most confident sentence on the page attached to the least real figure.
  const badge = badgeElement(sampleBadge(model.base, { illustrative: true }));
  head.append(title, chip, badge);
  if (model.showing) {
    const showing = document.createElement('p');
    showing.className = 'showing';
    showing.textContent = model.showing;
    head.append(showing);
  }
  figure.append(head);

  const readings = insightRow(model);
  if (readings) figure.append(readings);

  let chart: Chart | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let kindForChart: ChartType | undefined;

  // The kind that is drawn, not the kind that was asked for: the colours in the
  // table have to be the ones on the canvas beside it, and `drawnAs` is the only
  // place that knows the difference.
  const colours = palette(model, drawnAs(model, kind), accent);

  if (kind === 'table') {
    const only = table(model, colours);
    only.open = true;
    only.querySelector('summary')?.remove();
    figure.append(only);
  } else {
    const canvasWrap = document.createElement('div');
    canvasWrap.className = kind === 'map' ? 'canvas canvas-map' : 'canvas';
    canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', summarise(model, kind));
    canvasWrap.append(canvas);
    figure.append(canvasWrap);
    figure.append(table(model, colours));
    kindForChart = kind;
  }

  for (const note of notes(model, kind)) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = note;
    figure.append(p);
  }

  // Attach before drawing. A responsive Chart.js chart measures its container at
  // construction, and a detached container has no size — so the chart renders at
  // a fallback size, or not at all, and only corrects itself if a ResizeObserver
  // happens to fire afterwards. Whether that fires is engine- and
  // timing-dependent, which is why the charts appeared only after a refresh.
  host.append(figure);

  if (canvas && kindForChart) {
    if (kindForChart === 'map') {
      void mapConfig(model, accent).then((config) => {
        chart = new Chart(canvas!, config);
      });
    } else {
      chart = new Chart(canvas, baseConfig(model, kindForChart, accent));
    }
  }

  return { destroy: () => chart?.destroy() };
}
