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
  LineController, LineElement, LinearScale, PieController, PointElement, Tooltip,
  type Plugin,
} from 'chart.js';
import { GRID, INK, labelInk, MUTED } from './palette';

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

export const valueLabels: Plugin<'bar'> = {
  id: 'valueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const horizontal = chart.options.indexAxis === 'y';
    const stacked = chart.options.scales?.['x']?.stacked === true;
    ctx.save();
    ctx.font = `600 11px ${bodyFont()}`;
    chart.data.datasets.forEach((dataset, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      meta.data.forEach((element, j) => {
        const value = dataset.data[j];
        if (typeof value !== 'number') return;
        if (stacked && value < 6) return;            // no room inside a thin segment
        const { x, y } = element.getProps(['x', 'y'], true);
        const base = (element as unknown as { base?: number }).base ?? 0;
        ctx.textAlign = horizontal ? (stacked ? 'center' : 'left') : 'center';
        ctx.textBaseline = horizontal ? 'middle' : 'bottom';
        // Outside the bar the label sits on the card, where the ink is right. Inside
        // a segment it has to answer to whatever that segment is painted, which is
        // the theme's colour now and can be a pale gold. Per element, not per chart:
        // a stacked answer scale puts four colours in one row and only one of them
        // wants white.
        const fill = (element as unknown as { options?: { backgroundColor?: unknown } }).options?.backgroundColor
          ?? (Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[j] : dataset.backgroundColor);
        ctx.fillStyle = stacked ? labelInk(fill) : INK;
        const cx = horizontal ? (stacked ? (x + base) / 2 : x + 6) : x;
        ctx.fillText(`${value}%`, cx, horizontal ? y : y - 4);
      });
    });
    ctx.restore();
  },
};

let registered = false;

export function setupCharts(): void {
  if (registered) return;
  registered = true;
  Chart.register(
    ArcElement, BarController, BarElement, CategoryScale, Filler, Legend,
    LineController, LineElement, LinearScale, PieController, PointElement, Tooltip,
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
