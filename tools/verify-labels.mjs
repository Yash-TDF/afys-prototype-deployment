// Every value label every bar chart draws, checked for collisions: two labels
// whose boxes overlap, or a label off the canvas. Exits 1 on any.
//
// Grouped bars (a bar per wave in each category) drew "68%63%69%" run together on
// the influence charts, on every "compare by waves" chart in Explore, and on more
// theme-page charts at phone width (hotfix after #20). valueLabels now labels
// every bar upright, turned a quarter, or none, whichever fits.
//
// Read-only for the repo. Run with the prototype served (`pnpm exec vite`), then
//   node tools/verify-labels.mjs [--url http://localhost:5173] [--explore]
// Theme pages at 1600, 1280 and 390 wide; with --explore, every question in
// Explore too, as Bars, Horizontal bars and Stacked, alone and compared by waves
// and by gender, at 1280 and 390.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const argv = process.argv.slice(2);
const urlAt = argv.indexOf('--url');
const BASE = urlAt >= 0 ? argv[urlAt + 1] : (process.env.BASE_URL ?? 'http://localhost:5173');
const EXPLORE = argv.includes('--explore');

const browser = await pw.chromium.launch(process.env.CHROME_PATH
  ? { headless: true, executablePath: process.env.CHROME_PATH }
  : { headless: true, channel: 'chrome' });

// Each label's box, from the text, position, alignment and transform valueLabels
// draws it with, in the canvas's own font. Recorded only while the chart's own
// plugin object draws: after an edit the dev server serves the module under a
// new URL, so an imported copy of the plugin is not the one in use.
const RECORD = () => {
  window.__recording = null;
  const fill = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
    const rec = window.__recording;
    if (rec && rec.ctx === this) {
      const m = this.measureText(text);
      const w = m.width;
      const h = (m.actualBoundingBoxAscent ?? 8) + (m.actualBoundingBoxDescent ?? 2);
      let ox = x, oy = y;
      if (this.textAlign === 'center') ox -= w / 2;
      else if (this.textAlign === 'right' || this.textAlign === 'end') ox -= w;
      if (this.textBaseline === 'middle') oy -= h / 2;
      else if (this.textBaseline === 'bottom' || this.textBaseline === 'alphabetic') oy -= h;
      const t = this.getTransform();
      const dpr = window.devicePixelRatio || 1;
      const pts = [[ox, oy], [ox + w, oy], [ox, oy + h], [ox + w, oy + h]]
        .map(([px, py]) => [(t.a * px + t.c * py + t.e) / dpr, (t.b * px + t.d * py + t.f) / dpr]);
      rec.boxes.push({
        text: String(text),
        x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])),
        y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])),
      });
    }
    return fill.call(this, text, x, y, maxWidth);
  };
};

async function charts(page, where) {
  return page.evaluate(async (where) => {
    const { Chart } = await import('/src/charts/setup.ts');
    const out = [];
    for (const canvas of document.querySelectorAll('canvas')) {
      const chart = Chart.getChart(canvas);
      const plugin = chart?.config.type === 'bar' && (chart.config.plugins ?? []).find((p) => p.id === 'valueLabels');
      if (!plugin) continue;
      let el = canvas, title = '';
      for (let i = 0; i < 8 && el && !title; i++) { el = el.parentElement; title = el?.querySelector('h2, h3, h4')?.textContent?.trim() ?? ''; }
      window.__recording = { ctx: chart.ctx, boxes: [] };
      try { plugin.afterDatasetsDraw(chart, {}, {}); } finally { /* boxes kept below */ }
      const boxes = window.__recording.boxes;
      window.__recording = null;
      const clashes = [];
      for (let a = 0; a < boxes.length; a++) {
        for (let b = a + 1; b < boxes.length; b++) {
          const A = boxes[a], B = boxes[b];
          if (A.x0 < B.x1 - 0.5 && B.x0 < A.x1 - 0.5 && A.y0 < B.y1 - 0.5 && B.y0 < A.y1 - 0.5) clashes.push(`${A.text}/${B.text}`);
        }
      }
      const off = boxes.filter((b) => b.y0 < -0.5 || b.x0 < -0.5 || b.x1 > chart.width + 0.5).map((b) => b.text);
      const mode = boxes.length === 0 ? 'none' : boxes.some((b) => (b.x1 - b.x0) < (b.y1 - b.y0)) ? 'turned' : 'upright';
      out.push({ where, title, clashes, off, mode });
    }
    return out;
  }, where);
}

const results = [];
const errors = [];
const sweeps = [[1600, false], [1280, false], [390, false], ...(EXPLORE ? [[1280, true], [390, true]] : [])];
for (const [width, explore] of sweeps) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(RECORD);
  await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
  const { slugs, codes } = await page.evaluate(async () => {
    const c = await import('/src/content.ts');
    return { slugs: c.themes.map((t) => t.slug), codes: c.questions.map((q) => q.code) };
  });
  if (!explore) {
    for (const slug of slugs) {
      await page.goto(`${BASE}/#/theme/${slug}`); await page.waitForTimeout(1500);
      results.push(...(await charts(page, `${width} theme/${slug}`)));
    }
  } else {
    for (const code of codes) {
      for (const q of ['', '&chart=hbar', '&chart=stacked', '&cmp=wave', '&chart=hbar&cmp=wave', '&cmp=gender', '&chart=hbar&cmp=gender']) {
        await page.goto(`${BASE}/#/explore?q=${code}${q}`); await page.waitForTimeout(400);
        results.push(...(await charts(page, `${width} explore ${code}${q}`)));
      }
    }
  }
  await page.close();
}
await browser.close();

const bad = results.filter((r) => r.clashes.length || r.off.length);
const modes = {};
for (const r of results) modes[r.mode] = (modes[r.mode] ?? 0) + 1;
console.log(`${results.length} labelled bar charts; label modes ${JSON.stringify(modes)}`);
for (const r of bad) {
  console.log(`FAIL ${r.where} | ${r.title} | ${r.clashes.length} clash(es): ${r.clashes.slice(0, 4).join(', ')}`
    + (r.off.length ? ` | off the canvas: ${r.off.join(', ')}` : ''));
}
if (errors.length) console.log(`page errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
console.log(bad.length || errors.length ? `${bad.length} chart(s) with a clash, ${errors.length} page error(s)` : 'no label clashes, no page errors');
process.exit(bad.length || errors.length ? 1 : 0);
