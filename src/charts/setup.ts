// Chart.js registration, defaults, and the one plugin the design needs that
// Chart.js does not ship.
//
// Two things here are about bytes rather than drawing, and both matter because
// low bandwidth is a hard requirement of this project:
//
//   1. Controllers are registered by hand. `chart.js/auto` would pull in every
//      chart type in the package; we draw four.
//   2. The map lives behind `registerGeo()`, which imports `chartjs-chart-geo`
//      dynamically. The themes landing draws no charts at all and the explorer
//      draws a map only when asked, so neither should pay for the geo controller
//      or the projection maths up front.
import {
  Chart, ArcElement, BarController, BarElement, CategoryScale, Filler, Legend,
  LineController, LineElement, LinearScale, PieController, PointElement, SubTitle, Tooltip,
  type Plugin,
} from 'chart.js';
import { GRID, INK, labelInk, MUTED } from './palette';
import { fmtPct } from '../ui/format';

/**
 * Value labels on bars.
 *
 * Chart.js has no equivalent of the label-on-the-mark the approved prototype
 * shows, and the deck's charts are read as values rather than compared by eye, so
 * this is not decoration. Forty lines — and it is the whole of the gap people
 * mean when they say Chart.js "needs plugins" for this design.
 */
/**
 * The page's body face, read from the stylesheet rather than named again here.
 *
 * A canvas does not inherit CSS, so Chart.js has to be told the font — and it
 * used to be told by name, in two places, which meant the comment in tokens.css
 * promising that --body was the only thing to change was not true.
 */
let family: string | null = null;
export function bodyFont(): string {
  family ??= getComputedStyle(document.documentElement).getPropertyValue('--body').trim()
    || 'system-ui, sans-serif';
  return family;
}

/** A value label's box on the canvas, in CSS pixels. */
interface LabelBox { x0: number; x1: number; y0: number; y1: number }

const LABEL_PX = 11;
/** Clear space a label keeps from its neighbour, and from its bar's end. */
const LABEL_GAP_PX = 2;

const overlaps = (a: LabelBox, b: LabelBox): boolean =>
  a.x0 < b.x1 + LABEL_GAP_PX && b.x0 < a.x1 + LABEL_GAP_PX
  && a.y0 < b.y1 + LABEL_GAP_PX && b.y0 < a.y1 + LABEL_GAP_PX;

/** Whether every box stays on the canvas and clear of every other. */
function clear(boxes: LabelBox[], width: number): boolean {
  if (boxes.some((b) => b.x0 < 0 || b.y0 < 0 || b.x1 > width)) return false;
  return boxes.every((a, i) => boxes.slice(i + 1).every((b) => !overlaps(a, b)));
}

/**
 * Each bar's percentage, drawn so no two labels touch.
 *
 * A grouped chart (a bar per wave, or per gender, in each category) can put four
 * bars where one label fits, and every label used to be drawn regardless: "68%63%"
 * running together on the influence charts, on every "compare by waves" chart in
 * Explore, and on more theme-page charts at phone width. So one rule per chart:
 * upright as before when every label fits; on a vertical chart, turned a quarter
 * when they fit that way; otherwise none. Every figure is still in the tooltip and
 * the table under the chart. A chart either labels every bar or none, so no bar
 * reads as unlabelled for a reason the reader has to guess.
 *
 * Inside a stacked segment a label is drawn as before, and only from 6%.
 */
export const valueLabels: Plugin<'bar'> = {
  id: 'valueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const horizontal = chart.options.indexAxis === 'y';
    const stacked = chart.options.scales?.['x']?.stacked === true;
    ctx.save();
    ctx.font = `600 ${LABEL_PX}px ${bodyFont()}`;

    const labels: { text: string; x: number; y: number; base: number; width: number; fill: unknown }[] = [];
    chart.data.datasets.forEach((dataset, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      meta.data.forEach((element, j) => {
        const value = dataset.data[j];
        if (typeof value !== 'number') return;
        if (stacked && value < 6) return;            // no room inside a thin segment
        const { x, y } = element.getProps(['x', 'y'], true);
        const base = (element as unknown as { base?: number }).base ?? 0;
        // Outside the bar the label sits on the card, where the ink is right. Inside
        // a segment it has to answer to whatever that segment is painted, which is
        // the theme's colour now and can be a pale gold. Per element, not per chart:
        // a stacked answer scale puts four colours in one row and only one of them
        // wants white.
        const fill = (element as unknown as { options?: { backgroundColor?: unknown } }).options?.backgroundColor
          ?? (Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[j] : dataset.backgroundColor);
        const text = fmtPct(value);
        labels.push({ text, x, y, base, width: ctx.measureText(text).width, fill });
      });
    });

    if (stacked) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const l of labels) {
        ctx.fillStyle = labelInk(l.fill);
        ctx.fillText(l.text, (l.x + l.base) / 2, l.y);
      }
      ctx.restore();
      return;
    }

    const half = LABEL_PX / 2;
    const upright: LabelBox[] = labels.map((l) => horizontal
      ? { x0: l.x + 6, x1: l.x + 6 + l.width, y0: l.y - half, y1: l.y + half }
      : { x0: l.x - l.width / 2, x1: l.x + l.width / 2, y0: l.y - 4 - LABEL_PX, y1: l.y - 4 });
    const turned: LabelBox[] = labels.map((l) =>
      ({ x0: l.x - half, x1: l.x + half, y0: l.y - 4 - l.width, y1: l.y - 4 }));

    ctx.fillStyle = INK;
    if (clear(upright, chart.width)) {
      ctx.textAlign = horizontal ? 'left' : 'center';
      ctx.textBaseline = horizontal ? 'middle' : 'bottom';
      for (const l of labels) ctx.fillText(l.text, horizontal ? l.x + 6 : l.x, horizontal ? l.y : l.y - 4);
    } else if (!horizontal && clear(turned, chart.width)) {
      // Read bottom to top, starting just above the bar.
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (const l of labels) {
        ctx.save();
        ctx.translate(l.x, l.y - 4);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(l.text, 0, 0);
        ctx.restore();
      }
    }
    ctx.restore();
  },
};

/**
 * Every bar of a grouped chart as wide as a full group's bars.
 *
 * `skipNull` centres a category's bars on its label when some series have no
 * value there (render.ts), but Chart.js then spreads the bars it has across the
 * whole slot: Germany's one 2026 bar came out four bars wide, and read as
 * weightier than its neighbours. Worked out after layout, from Chart.js's own
 * defaults (categoryPercentage 0.8, barPercentage 0.9), before the bars are placed.
 */
export const evenBars: Plugin<'bar'> = {
  id: 'evenBars',
  beforeDatasetsUpdate(chart) {
    const shown = chart.data.datasets.filter((_, i) => chart.isDatasetVisible(i)).length;
    const categories = chart.data.labels?.length ?? 0;
    if (shown < 2 || categories === 0 || !chart.chartArea) return;
    const span = chart.options.indexAxis === 'y' ? chart.chartArea.height : chart.chartArea.width;
    const thickness = (span / categories) * 0.8 / shown * 0.9;
    for (const dataset of chart.data.datasets) {
      (dataset as { maxBarThickness?: number }).maxBarThickness = thickness;
    }
  },
};

let registered = false;

export function setupCharts(): void {
  if (registered) return;
  registered = true;
  Chart.register(
    ArcElement, BarController, BarElement, CategoryScale, Filler, Legend,
    LineController, LineElement, LinearScale, PieController, PointElement, Tooltip,
    // Draws the hidden-answers line inside the canvas, so a PNG says it too. THE-349.
    SubTitle,
  );
  Chart.defaults.font.family = bodyFont();
  Chart.defaults.font.size = 12;
  Chart.defaults.color = MUTED;
  Chart.defaults.borderColor = GRID;
  // Merge into the defaults rather than replace them. Chart.js builds each animation from
  // the option names already on this object; replacing it dropped `type: 'color'`, so the
  // first hover threw inside the shared animation loop and no chart on the page drew again.
  //
  // The timing is the approved prototype's: 700ms on a cubic ease-out, each bar
  // starting 18ms after the one before so a chart fills from the left instead of
  // rising as a block. Bars only — a pie whose slices arrive one at a time reads
  // as loading, and a map has fifty-one regions. Only the first draw is
  // staggered: a hover or a resize that waited its turn would feel broken.
  //
  // A canvas is out of reach of the stylesheet's prefers-reduced-motion rule, so
  // the same preference is read here.
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  Chart.defaults.set('animation', {
    duration: still ? 0 : 700,
    easing: 'easeOutCubic',
    delay: (ctx: { type: string; mode: string; dataIndex: number; chart: Chart }): number => {
      if (still || ctx.type !== 'data' || ctx.mode !== 'default') return 0;
      const config = ctx.chart.config as { type?: string };
      return config.type === 'bar' ? ctx.dataIndex * 18 : 0;
    },
  });
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.tooltip.backgroundColor = INK;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 4;
  Chart.defaults.plugins.tooltip.displayColors = false;
  // On every tooltip, because a screenshot of one chart travels without the
  // banner that says the rest of it.
  Chart.defaults.plugins.tooltip.callbacks.afterBody = () => 'Illustrative figure — not a survey result';
  // Chart.js prints the raw value; the page prints whole numbers. A pie parses
  // to a number, a bar to a point on whichever axis carries the value. The map
  // has its own label callback and is not affected.
  Chart.defaults.plugins.tooltip.callbacks.label = (item) => {
    const parsed = item.parsed as number | { x: number; y: number };
    const value = typeof parsed === 'number'
      ? parsed
      : (item.chart.options.indexAxis === 'y' ? parsed.x : parsed.y);
    if (typeof value !== 'number' || !Number.isFinite(value)) return item.formattedValue;
    const name = item.dataset.label;
    return `${name ? `${name}: ` : ''}${fmtPct(value)}`;
  };
}

let geo: Promise<void> | null = null;

/** Load and register the choropleth controller. Called only by the map views. */
export function registerGeo(): Promise<void> {
  setupCharts();
  geo ??= import('chartjs-chart-geo').then((m) => {
    Chart.register(m.ChoroplethController, m.ColorScale, m.GeoFeature, m.ProjectionScale);
  });
  return geo;
}

export { Chart };
