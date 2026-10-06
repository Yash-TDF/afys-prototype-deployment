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
import { GRID, NO_DATA, OFF_SCALE, OFF_SCALE_LABEL, pieStops, ramp, roleColours, SCALE_3, SCALE_4, SCALE_5, SERIES } from './palette';
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
  // By position first, as the charts have always been coloured; then, where the
  // answers are options whose meaning bands.yaml records, each answer with a
  // side takes its side's colour and the rest keep their positional one. So a
  // tracked question's lines and a single distribution across answers read by
  // meaning, while categorical answers, and any label no band claims, are as
  // they were: several series stay distinguishable, and a pie is never one colour.
  const positional = positionalPalette(model, kind, accent);
  if (model.series.length > 1) {
    return model.seriesKind === 'options'
      ? roleColours(model.series.map((s) => s.label), model.roles, positional)
      : positional;
  }
  if (model.categoryKind !== 'options') return positional;
  // One series of answers on a bar: a categorical answer takes the theme's one
  // accent, as bands.yaml has it ("the single accent on a one-series bar, and
  // position everywhere else"). Four reasons to emigrate in green, leaf, gold
  // and rose read as a scale they are not. A pie keeps position, as a pie in
  // one colour says nothing; and don't-know is grey either way.
  const base = kind === 'pie'
    ? positional
    : model.categories.map((c, i) => (model.roles?.[c] === 'categorical' ? accent : positional[i]!));
  return roleColours(model.categories, model.roles, base);
};

const positionalPalette = (model: ViewModel, kind: ChartType, accent: string): string[] => {
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
  // A grid's rows are each one measurement too, of separate questions: a scale's
  // colours across three organisations would read as a ranking of answers.
  if (model.categoryKind === 'countries' || model.categoryKind === 'rows' || count > 5) {
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

/** 205px holds 28 characters of the body face at 12px, about 7.3px a character. */
const LABEL_CHAR_PX = 205 / 28;
/** Room beside the longest label for the axis's own padding. */
const LABEL_GUTTER_PX = 18;
/**
 * Width of a horizontal chart's label column: what its longest label needs, up to
 * 205px, or 40% of a phone-width chart (under 400px). A fixed 205px was right for
 * "International involvement in Africa" and wrong for "2020": a chart whose labels
 * are years spent 160px of its card on empty space and its bars sat against the
 * right edge. THE-350.
 */
const labelCap = (chartWidth: number): number => (chartWidth < 400 ? Math.round(chartWidth * 0.4) : 205);
const labelColumn = (chartWidth: number, longestLabel: number): number => {
  const needed = Math.ceil(longestLabel * LABEL_CHAR_PX) + LABEL_GUTTER_PX;
  return Math.min(labelCap(chartWidth), needed);
};
/**
 * Characters a line of a horizontal label may hold: the cap's worth, 28 on a
 * desktop chart. From the cap alone rather than the column less its gutter,
 * which cut three characters that used to fit; the column is then measured to
 * the widest line actually drawn (see afterFit below), so the estimate only has
 * to be generous, never exact.
 */
const columnChars = (chartWidth: number): number => Math.max(12, Math.floor(labelCap(chartWidth) / LABEL_CHAR_PX));
/** A vertical chart's category label never wraps tighter than this many characters a line. */
const VERTICAL_MIN_CHARS = 8;
/** Room the value axis takes from a vertical chart's width before the categories share the rest. */
const VALUE_AXIS_PX = 60;
/** Height a horizontal chart gives each category, per line of label, plus the axis. */
const ROW_PX = 22;
const AXIS_PX = 70;

/**
 * A category label as lines that fit the room, instead of cut with an ellipsis.
 *
 * The labels are the client's own answer options — "Increased access to
 * essential services and resources" — and cutting one to 28 characters lost the
 * half that identifies it, which the client pointed out. Chart.js draws an array
 * as one line per element, so the words are packed into lines no longer than
 * `limit`; a single word longer than the limit stays whole. A label that fits
 * on one line is returned as a string, as before.
 *
 * With `maxLines`, the limit is widened until the label fits in that many lines:
 * a label Chart.js is going to turn 45° needs to be short in lines, not in
 * characters, because each extra line of a turned label runs into the label
 * beside it.
 */
export function wrapLabel(label: string, limit: number, maxLines = Infinity): string | string[] {
  const pieces = labelPieces(label);
  const join = (line: string, piece: Piece): string => (line === '' ? piece.text : piece.glued ? line + piece.text : `${line} ${piece.text}`);
  for (let width = limit; ; width += 1) {
    const lines: string[] = [];
    let line = '';
    for (const piece of pieces) {
      if (line && join(line, piece).length > width) {
        lines.push(line);
        line = piece.text;
      } else {
        line = join(line, piece);
      }
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines || width >= label.length) return lines.length > 1 ? lines : lines[0] ?? '';
  }
}

/** A piece of a label a line may end after; `glued` when it continues the word before it. */
type Piece = { text: string; glued: boolean };

/**
 * Where a label may break. After a space, and after a slash or hyphen inside a
 * word: "technological/digital" and "Newspaper/Magazines" are wider than a
 * phone's label column and stayed whole. Only inside a word: "X / Twitter" and
 * "Disagree/ don't know" are spaced by the client, and a break that ate the
 * space put them back as "X /Twitter". A piece that came off a word joins it
 * again without a space; a piece that followed a space, with one.
 */
export function labelPieces(label: string): Piece[] {
  return label.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).flatMap((word) =>
    word.split(/(?<=\S[/-])(?=\S)/).map((text, i) => ({ text, glued: i > 0 })));
}

/**
 * Stacking a comparison would be wrong, so it is not drawn that way.
 *
 * Each series in a comparison is its own distribution summing to 100; stacked on
 * one axis they reach 200. This is the only place that knows both the model and
 * the chart type, so the substitution belongs here rather than being asserted by
 * a model that cannot see which chart was asked for.
 */
const drawnAs = (model: ViewModel, kind: ChartType): ChartType => {
  if (model.compare !== 'none' && kind === 'stacked') return 'bar';
  // A pie asked for several series (a tracked question: one series per answer,
  // the waves as categories) stays a pie, of the latest wave: the deck's slides
  // 23 and 29 say "Show the 2026 data as a pie chart". Drawing every wave into
  // one pie gave the multi-ring chart the client asked about; see the pie case
  // in baseConfig.
  // A line joins its categories, so it claims they are points along something.
  // Answer options are not: "Instagram" to "TikTok" is not a distance. Only
  // waves are, so a line over anything else draws as horizontal bars.
  if (kind === 'line' && model.categoryKind !== 'waves') return 'hbar';
  return kind;
};

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
  const longestLabel = Math.max(0, ...model.categories.map((c) => c.length));
  const categoryAxis = {
    grid: { display: false },
    // Chart.js would otherwise allot the category axis a fraction of the canvas
    // and clip anything longer. Thirty characters of the body face at 12px needs
    // about this much. On a phone-width chart that would leave no room for the
    // bars themselves, so on a chart under 400px wide the column takes 40% of it.
    ...(horizontal ? {
      // The column is what the widest drawn line needs, measured in the chart's
      // own font, never more than the cap the wrapping assumed. The character
      // estimate is deliberately generous so no line overruns its column; used as
      // the column width it left "I'm not interested in news" with 80px of air.
      afterFit: (scale: {
        width: number; ctx: CanvasRenderingContext2D; ticks: { label: string | string[] }[];
        chart: { width: number; canvas: HTMLCanvasElement; resize(): void };
      }) => {
        const cap = labelColumn(scale.chart.width, longestLabel);
        const { ctx } = scale;
        ctx.save();
        ctx.font = `${Chart.defaults.font.size}px ${Chart.defaults.font.family}`;
        const lines = scale.ticks.flatMap((t) => (Array.isArray(t.label) ? t.label : [t.label]));
        const widest = Math.max(0, ...lines.map((line) => ctx.measureText(String(line)).width));
        ctx.restore();
        // The canvas was sized for an estimated column; the real one may wrap the
        // labels to more or fewer lines than that. Set it to what the lines drawn
        // need and lay out again: the count depends on the width, not the height,
        // so the second pass finds the same number and stops.
        const wrap = scale.chart.canvas.parentElement;
        const needed = Math.max(300, lines.length * ROW_PX + AXIS_PX);
        if (wrap && Math.abs(wrap.getBoundingClientRect().height - needed) > 1) {
          wrap.style.height = `${needed}px`;
          requestAnimationFrame(() => scale.chart.resize());
        }
        scale.width = Math.min(cap, Math.ceil(widest) + LABEL_GUTTER_PX);
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
      // A wrapped label can still hold one word wider than its slot
      // ("environmental" in a 66px slot). Chart.js rotates only when a label
      // does not fit, so short labels stay upright as they were.
      maxRotation: many ? 60 : 45,
      // Stood at 90 degrees on a phone, a name's height across the axis has to
      // fit its slot, and the ink of a name is about 1.1 times the font size.
      // 11px fits every phone 360px wide and up; at 320px sixteen names share
      // about 10px each, so the size steps down to what the slot holds, never
      // below 9px. (12px was a hair too tall at 360px: THE-246.)
      ...(!horizontal && many ? {
        font: (ctx: { chart: { width: number } }) => {
          if (ctx.chart.width >= 400) return undefined;
          const slot = (ctx.chart.width - VALUE_AXIS_PX) / model.categories.length;
          return { size: Math.max(9, Math.min(11, Math.floor(slot / 1.1))) };
        },
      } : {}),
      // Real answer options are long — "Increased access to essential services
      // and resources". Chart.js caps how much width it gives an axis and then
      // clips what does not fit, losing the *start* of the label, which is the
      // half that identifies it. Wrap to the room there is instead; the canvas
      // height (below) and the label column (above) follow the lines.
      callback(this: { getLabelForValue(v: number): string; chart: { width: number } }, value: number) {
        const label = this.getLabelForValue(value);
        // Horizontal: the label column.
        if (horizontal) return wrapLabel(label, columnChars(this.chart.width));
        // A phone-width chart of many categories stands its labels at 90 degrees
        // (afterCalculateLabelRotation above). There a second line sits beside the
        // first, a line-height across, and lands on the next category: "Faso" over
        // Chad. So a label stood upright stays one line, however long.
        if (many && this.chart.width < 400) return label;
        // Vertical: the slot each category gets, the chart's width less the value
        // axis shared between the categories, so seven policies in a 525px chart
        // wrap to what 66px can hold. If any label holds a word wider than the
        // slot ("environmental"), Chart.js will turn every label 45°, and a turned
        // label three lines deep runs into its neighbour: then wrap to two lines.
        const slotChars = Math.max(VERTICAL_MIN_CHARS, Math.floor(((this.chart.width - VALUE_AXIS_PX) / model.categories.length) / LABEL_CHAR_PX));
        const upright = model.categories.every((c) => labelPieces(c).every((p) => p.text.length <= slotChars));
        return upright ? wrapLabel(label, slotChars) : wrapLabel(label, slotChars, 2);
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
    case 'pie': {
      // A tracked question reaches here with one series per answer and the
      // waves as categories. A pie shows one distribution, so it takes the
      // latest wave's figure from each series and one slice per answer, coloured
      // as that answer's series is; the earlier waves stay in the table and
      // notes() says which wave is shown. One ring per wave, each a flat colour,
      // was the chart the client could not read.
      // Guarded on the shape, not on the series count: a comparison on a pie is
      // refused before it gets here, but that is refuse()'s promise, not this one's.
      const latest = model.categories.length - 1;
      const oneWave = model.seriesKind === 'options' && model.categoryKind === 'waves'
        ? {
          labels: model.series.map((s) => s.label),
          datasets: [{
            label: String(model.categories[latest] ?? ''),
            data: model.series.map((s) => s.values[latest] ?? 0),
            backgroundColor: colours,
            borderColor: colours,
            borderWidth: 0,
          }],
        }
        : { labels: model.categories, datasets };
      return {
        type: 'pie',
        data: oneWave,
        // A pie fills its canvas to the top edge, where the reading chips end;
        // the padding is the gap a bar chart's axis area gives for free.
        options: { ...shared, plugins: { legend: { display: true, position: 'bottom' as const } }, cutout: '52%', layout: { padding: { top: 16 } } },
      } as ChartConfiguration;
    }
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
  // A grid's rows are organisations, statements or policies, each its own
  // question; "Response" called them answers (review of #20).
  rows: 'Item',
};

/** The base a figure states. A grid's rows are separate questions, each with its own. */
const baseText = (model: ViewModel): string => (model.categoryKind === 'rows'
  ? 'each row is a separate question with its own base'
  : `base ${model.base.toLocaleString('en-GB')} respondents`);

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
    // A row not asked in a wave sorts with the absent ones, last.
    return model.series[column]?.values[row] ?? undefined;
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
  caption.textContent = `${model.title} — illustrative figures, ${baseText(model)}`;
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
        // Null is a grid row the survey did not ask in this wave: said so, never a
        // dash that could be read as a figure lost.
        td.textContent = value === undefined ? '—' : value === null ? 'Not asked' : fmtPct(value);
        if (value !== undefined && value !== null) {
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
  const values = model.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
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
  if (requested === 'stacked' && drawnAs(model, requested) === 'bar') {
    out.push(
      'Each series is its own distribution, so they are drawn side by side rather '
      + 'than stacked — stacked they would total more than 100%.',
    );
  }
  if (requested === 'pie' && model.seriesKind === 'options' && model.categoryKind === 'waves') {
    const latest = model.categories[model.categories.length - 1];
    out.push(`Showing ${latest}; the earlier waves are in the table.`);
  }
  out.push(...model.caveats);
  if (model.optionsInvented) {
    out.push(
      'Response options on this chart are placeholders — the deck does not record '
      + 'them. The real list is one of the things we need from PSB.',
    );
  }
  // One "Base: 412" under six organisations claimed one denominator for six
  // questions (review of #20).
  out.push(model.categoryKind === 'rows'
    ? 'Each row is a separate question with its own base (illustrative).'
    : `Base: ${model.base.toLocaleString('en-GB')} respondents (illustrative).`);
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
  // Two parts, header and body, so that a card in a grid can be a two-row
  // subgrid and side-by-side charts start at the same height whatever their
  // headers do. Everything a reader sees above the chart is the head; the chart,
  // its table and its notes are the body. THE-350.
  const chartHead = document.createElement('div');
  chartHead.className = 'chart-head';
  chartHead.append(head);
  const readings = insightRow(model);
  if (readings) chartHead.append(readings);
  figure.append(chartHead);

  const chartBody = document.createElement('div');
  chartBody.className = 'chart-body';
  figure.append(chartBody);

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
    chartBody.append(only);
  } else {
    const canvasWrap = document.createElement('div');
    canvasWrap.className = kind === 'map' ? 'canvas canvas-map' : 'canvas';
    // A horizontal chart's height follows its labels: eight two-line answers do
    // not fit the 300px a four-bar chart gets, and were being clipped rather
    // than wrapped. The wrap uses the desktop label column; on a phone the
    // column is narrower and the labels wrap further, which the extra rows absorb.
    const drawn = drawnAs(model, kind);
    if (drawn === 'hbar' || drawn === 'stacked') {
      // The chart is not built yet, so its width is estimated from the window:
      // the page's gutters, the card's padding and its border come off it, 94px
      // in all, measured. On a 375px phone that is a 281px chart and a 112px
      // column holding fifteen characters, not the desktop's twenty-eight, and
      // the rows must be counted at that. If the estimate still falls short, the
      // axis grows the canvas once it has laid its ticks out (afterFit, below).
      const limit = columnChars(Math.max(200, window.innerWidth - 94));
      const lines = model.categories.reduce((n, c) => {
        const wrapped = wrapLabel(c, limit);
        return n + (Array.isArray(wrapped) ? wrapped.length : 1);
      }, 0);
      canvasWrap.style.height = `${Math.max(300, lines * ROW_PX + AXIS_PX)}px`;
    }
    canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', summarise(model, kind));
    canvasWrap.append(canvas);
    chartBody.append(canvasWrap);
    chartBody.append(table(model, colours));
    kindForChart = kind;
  }

  for (const note of notes(model, kind)) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = note;
    chartBody.append(p);
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
      // On a first visit the charts are built before Montserrat has arrived, so
      // every label is measured in the fallback face and then drawn in a wider
      // one: a column sized to the measurement cut the first letters off. Lay the
      // chart out again once the face is in; a destroyed chart has no canvas.
      const face = `${Chart.defaults.font.size}px ${Chart.defaults.font.family}`;
      if (!document.fonts.check(face)) {
        void document.fonts.ready.then(() => {
          if (!chart?.canvas) return;
          // Chart.js keeps each scale's text widths in a cache keyed by the font
          // string, so a width measured in the fallback face is filed under
          // Montserrat's name and reused on every update. On a vertical axis that
          // sized the label area short: "Congo Brazzaville" was measured at 86px
          // and drawn at 97px, and lost its first letter. Empty the caches, then
          // lay out again in the real face.
          for (const scale of Object.values(chart.scales)) {
            (scale as unknown as { _longestTextCache: Record<string, unknown> })._longestTextCache = {};
          }
          chart.update('none');
        });
      }
    }
  }

  return { destroy: () => chart?.destroy() };
}
