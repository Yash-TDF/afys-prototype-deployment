// The landing view: what the survey is, then the twelve tiles.
//
// Three departures from the prototype the client has seen:
//
//   - The tiles are the deck's twelve. The live prototype still shows the 2024
//     report's chapter names — "Quality of Life", "Future Ambitions",
//     "Corruption" — which are not in the deck at all.
//   - The summary row carries only facts we can source: how many countries, how
//     many waves, how many themes, and the respondent count the client publishes.
//     Its sparkline is the real count of countries per wave, out of content.json.
//     The live prototype's third card leads with "RIGHT DIRECTION 55%", which is
//     the report's *wrong*-direction number — printed page 18 gives 37% right and
//     55% wrong — and that card is not reproduced here at any figure.
//   - The theme cards do carry a generated headline, a delta and a sparkline,
//     which is the shape the client approved. Every one is illustrative and says
//     so: the banner above, a chip on each card, and the reading spelled out in
//     each card's own label. They come from the same buildViewModel the explorer
//     uses, so a card agrees with the chart it leads to.
//
// This page loads no charting library, and the sparklines are hand-written SVG —
// that is the point of them. It also does not wait for the figures: see the
// dynamic import at the foot of this file.
import { type Theme, countries, inWave, latestWave, themes, waves } from '../content';
import { sparkline } from '../ui/sparkline';
import type { ThemeCardFigures } from './theme-card';

export function themesView(host: HTMLElement): void {
  host.replaceChildren();

  const intro = document.createElement('section');
  intro.className = 'hero';
  const h1 = document.createElement('h1');
  h1.className = 'an';
  h1.textContent = 'Survey Overview';
  const lede = document.createElement('p');
  lede.className = 'an';
  lede.textContent =
    `Explore findings across ${countries.length} countries and 14,000+ respondents `
    + `aged 18 to 24, surveyed in ${waves.length} waves since ${waves[0]!.year}.`;
  intro.append(h1, lede);

  const stats = document.createElement('div');
  stats.className = 'stat-row';

  // The countries-per-wave line is a real series out of the seeds, so it carries
  // no illustrative marking. The other three cards have no series behind them and
  // get no line rather than an invented one.
  const perWave = waves.map((w) => inWave(w.year).length);
  // Each card opens the data drawer at the section that backs it up, as the
  // approved prototype's do. `section` is a drawer section id, not a heading.
  const facts: {
    label: string; value: string; sub: string; section: string; opens: string;
    spark?: number[]; sparkLabel?: string;
  }[] = [
    {
      label: 'Countries',
      value: String(countries.length),
      sub: `Sub-Saharan Africa · ${inWave(latestWave).length} surveyed in ${latestWave}`,
      section: 'countries-surveyed',
      opens: 'View the countries surveyed',
      spark: perWave,
      sparkLabel: `Countries surveyed per wave: ${waves.map((w, i) => `${w.year}, ${perWave[i]}`).join('; ')}`,
    },
    {
      label: 'Respondents', value: '14,000+', sub: 'Aged 18 to 24, in each wave',
      section: 'study-overview', opens: 'About the study',
    },
    {
      label: 'Survey waves', value: String(waves.length), sub: waves.map((w) => w.year).join(' · '),
      section: 'waves', opens: 'View the waves',
    },
    {
      label: 'Themes', value: String(themes.length), sub: 'From the Portal Content deck',
      section: 'themes', opens: 'View the themes',
    },
  ];

  facts.forEach((fact, i) => {
    // A button, because it does something and a keyboard has to be able to do
    // it too. The prototype's card is a div with a click handler.
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `stat an a${i + 1}`;
    card.setAttribute('aria-label', `${fact.label}: ${fact.value}. ${fact.opens}`);
    card.setAttribute('aria-haspopup', 'dialog');
    card.title = fact.opens;
    // Loaded on the click, like the nav's own button: the landing page still
    // does not carry the drawer.
    card.addEventListener('click', () => {
      void import('../ui/drawer').then((drawer) => drawer.scrollTo(fact.section));
    });

    const go = document.createElement('span');
    go.className = 'stat-arrow';
    go.setAttribute('aria-hidden', 'true');
    go.append(arrowIcon(12));
    card.append(go);

    // Spans, not divs: a button may only contain phrasing content.
    const top = document.createElement('span');
    top.className = 'stat-top';

    const left = document.createElement('span');
    left.className = 'stat-left';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = fact.label;
    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = fact.value;
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = fact.sub;
    left.append(label, value, sub);
    top.append(left);

    if (fact.spark) {
      const line = sparkline(fact.spark, {
        width: 80, height: 40, className: 'sparkline', label: fact.sparkLabel,
      });
      if (line) top.append(line);
    }

    card.append(top);
    stats.append(card);
  });

  intro.append(stats);
  host.append(intro);

  const heading = document.createElement('h2');
  heading.className = 'section-heading an a5';
  heading.textContent = 'Explore by Theme';
  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = `${themes.length} themes`;
  heading.append(count);
  host.append(heading);

  const grid = document.createElement('section');
  grid.className = 'tile-grid';
  host.append(grid);

  const pending: { theme: Theme; tile: HTMLAnchorElement; slot: HTMLDivElement }[] = [];

  themes.forEach((theme, i) => {
    const tile = document.createElement('a');
    tile.className = `tile an a${Math.min(i + 5, 12)}`;
    tile.href = `#/theme/${theme.slug}`;
    tile.style.setProperty('--accent', theme.accent);

    const tag = document.createElement('span');
    tag.className = 'theme-tag';
    tag.textContent = `Theme ${theme.order}`;

    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.append(arrowIcon(14));

    // The tag and the arrow share a row that the rest of the card hangs below.
    const top = document.createElement('div');
    top.className = 'tt';
    top.append(tag, arrow);

    const name = document.createElement('h3');
    name.textContent = theme.name;

    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = `${theme.questions.length} question${theme.questions.length === 1 ? '' : 's'}`;

    // Empty, but present and height-reserved in CSS, so the figures landing a
    // moment later move nothing on the page.
    const slot = document.createElement('div');
    slot.className = 'tstats';

    tile.append(top, name, meta, slot);
    grid.append(tile);
    pending.push({ theme, tile, slot });
  });

  // The figures need the view model, which drags in the generators and the deck's
  // recovered answer options — about 5 KB gzipped that the names and question
  // counts above do not need. Loading it separately keeps the page everyone opens
  // as small as it was: the grid is readable immediately and the numbers arrive
  // after, rather than the whole landing page waiting on them.
  void import('./theme-card').then(({ themeCardFigures }) => {
    for (const { theme, tile, slot } of pending) {
      fill(theme, tile, slot, themeCardFigures(theme));
    }
  });
}

function fill(
  theme: Theme,
  tile: HTMLAnchorElement,
  slot: HTMLDivElement,
  figures: ThemeCardFigures,
): void {
  const left = document.createElement('div');
  left.className = 'tstat-l';

  if (figures.headline === null) {
    const none = document.createElement('span');
    none.className = 'tstat-none';
    none.textContent = `${theme.charts.length} chart${theme.charts.length === 1 ? '' : 's'} from the deck`;
    left.append(none);
    slot.append(left);
    return;
  }

  const headline = document.createElement('span');
  headline.className = 'tstat-v';
  headline.textContent = `${figures.headline}%`;
  left.append(headline);

  const badge = document.createElement('span');
  if (figures.delta) {
    const { points, from } = figures.delta;
    badge.className = `tstat-d ${points > 0 ? 'up' : points < 0 ? 'down' : 'flat'}`;
    badge.textContent = `${points > 0 ? '+' : ''}${points}pts since ${from}`;
  } else {
    badge.className = 'tstat-d flat';
    badge.textContent = figures.note ?? '';
  }
  left.append(badge);
  slot.append(left);

  if (figures.spark.length >= 2) {
    const line = sparkline(figures.spark, {
      width: 78, height: 36, className: 'tspark', activeIndex: figures.activeIndex,
    });
    if (line) slot.append(line);
  }

  // The third of the three places. This page loads no charting library, so there
  // is no renderer chip to inherit — the card carries its own.
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.textContent = 'Illustrative';
  tile.append(chip);

  const reading = figures.delta
    ? `${figures.headline}% in ${figures.delta.to}, ${figures.delta.points >= 0 ? 'up' : 'down'} `
      + `${Math.abs(figures.delta.points)} points since ${figures.delta.from}`
    : `${figures.headline}%${figures.note ? `, ${figures.note.toLowerCase()}` : ''}`;
  tile.setAttribute(
    'aria-label',
    `${theme.name}. ${theme.questions.length} questions. `
    + `${figures.of ?? 'Illustrative figure'}: ${reading}. Illustrative figure, not a survey result.`,
  );
}

function arrowIcon(size: number): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M7 17L17 7M17 7H7M17 7v10');
  svg.append(path);
  return svg;
}
