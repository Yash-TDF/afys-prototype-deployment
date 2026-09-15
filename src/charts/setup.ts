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
import { GRID, INK, MUTED } from './palette';

/**
 * Value labels on bars.
 *
 * Chart.js has no equivalent of the label-on-the-mark the approved prototype
 * shows, and the deck's charts are read as values rather than compared by eye, so
 * this is not decoration. Forty lines — and it is the whole of the gap people
 * mean when they say Chart.js "needs plugins" for this design.
 */
export const valueLabels: Plugin<'bar'> = {
  id: 'valueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const horizontal = chart.options.indexAxis === 'y';
    const stacked = chart.options.scales?.['x']?.stacked === true;
    ctx.save();
    ctx.font = '600 11px Montserrat, system-ui, sans-serif';
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
        ctx.fillStyle = stacked ? '#ffffff' : INK;
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
  Chart.defaults.font.family = 'Montserrat, system-ui, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = MUTED;
  Chart.defaults.borderColor = GRID;
  Chart.defaults.animation = { duration: 260 };
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
