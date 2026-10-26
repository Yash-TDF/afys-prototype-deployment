// The landing view: what the survey is, then the twelve tiles.
//
// Three departures from the prototype the client has seen:
//
//   - The tiles are the deck's twelve. The live prototype still shows the 2024
//     report's chapter names — "Quality of Life", "Future Ambitions",
//     "Corruption" — which are not in the deck at all.
//   - The summary row carries only facts we can source: how many countries, how
//     many waves, how many themes, and the respondent count the client publishes.
//     The live prototype's third card leads with "RIGHT DIRECTION 55%", which is
//     the report's *wrong*-direction number — printed page 18 gives 37% right and
//     55% wrong — and that card is not reproduced here at any figure.
//   - The theme cards do carry a generated headline and a delta, which is the
//     shape the client approved. Every one is illustrative and says so: the
//     banner above, a chip on each card, and the reading spelled out in each
//     card's own label. They come from the same buildViewModel the explorer uses,
//     so a card agrees with the chart it leads to.
//   - Each card carries its theme's picture on the right, in PSB's layout of
//     22 Oct (THE-404), where the line used to be: Michael's mock-up has none.
//
// This page loads no charting library. It also does not wait for the figures:
// see the dynamic import at the foot of this file.
import { type Theme, countries, fieldwork, inWave, latestWave, themes, waves } from '../content';
import pictures from '../data/tile-pictures.json';
import { fmtPct, fmtPts, roundHalfAway } from '../ui/format';
import type { ThemeCardFigures } from './theme-card';

/**
 * Each theme's picture on its tile (THE-404): PSB's illustration kit of 13 Oct, as supplied and not
 * recoloured, in public/themes/. The choice is our 14 Oct proposal, which Yash confirmed for the build
 * on 26 Oct; four are provisional until Rosie answers it, and none is a leader's portrait. The
 * portal's seed carries the same choice (themes.picture_file, scripts/gen_seeds.py THEME_PICTURE);
 * once that is merged, tools/build-content.mjs can read it from there and this file can go.
 */
const PICTURES: Readonly<Record<string, { file: string; provisional: boolean }>> = pictures;

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
    // No respondent count here: beside the Respondents card (published total plus
    // the 2026 file count) a "14,000+" read as the whole four-wave total.
    `Explore findings across ${countries.length} countries, from young people `
    + `aged 18 to 24 surveyed in ${waves.length} waves since ${waves[0]!.year}.`;
  intro.append(h1, lede);

  const stats = document.createElement('div');
  stats.className = 'stat-row';

  // No card draws a line. The Countries card had the one real series, countries
  // per wave, and Rosie's 8 Oct deck asked for it to go (THE-401); the other three
  // never had a series behind them. The card wording below is hers too.
  const n = (value: number): string => value.toLocaleString('en-GB');
  const publishedTotal = Object.values(fieldwork.waves).reduce((sum, w) => sum + (w.published ?? 0), 0);
  const latestCount = fieldwork.waves[String(latestWave)]?.interviews ?? 0;
  // Each card goes to the part of the Methodology page that backs it up, as the
  // approved prototype's cards opened a drawer. `section` is a section id on that
  // page, not a heading; the Themes card points down this page instead.
  const facts: { label: string; value: string; sub: string; section: string | null; opens: string }[] = [
    {
      label: 'Countries',
      value: String(countries.length),
      // Two lines, as in Rosie's deck, so the number stays with "countries"
      // (Ishwar, THE-401). `.stat .sub` keeps the line break.
      sub: `Across Sub-Saharan Africa\n${inWave(latestWave).length} countries included in ${latestWave}`,
      section: 'coverage',
      opens: 'View the countries surveyed, wave by wave',
    },
    {
      // PSB's published total for the waves they have published one for, 2020 to
      // 2024. The text under it is only the latest wave's count, ours from the
      // file, as Rosie asked. Whether the headline should become the four-wave
      // total is a question with her (9 Oct); it changes only if she says so.
      label: 'Respondents',
      value: n(publishedTotal),
      sub: `${n(latestCount)} respondents in ${latestWave}`,
      section: 'overview', opens: 'About the study',
    },
    {
      label: 'Survey waves', value: String(waves.length), sub: waves.map((w) => w.year).join(' · '),
      section: 'coverage', opens: 'View the waves',
    },
    {
      label: 'Key themes', value: String(themes.length), sub: `From hundreds of questions asked since ${waves[0]!.year}`,
      section: null, opens: 'Explore by theme',
    },
  ];

  facts.forEach((fact, i) => {
    // A button, because it does something and a keyboard has to be able to do
    // it too. The prototype's card is a div with a click handler.
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `stat an a${i + 1}`;
    card.setAttribute('aria-label', `${fact.label}: ${fact.value}. ${fact.opens}`);
    card.title = fact.opens;
    card.addEventListener('click', () => {
      if (fact.section) {
        window.location.hash = `#/methodology?s=${fact.section}`;
        return;
      }
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      host.querySelector('.tile-grid')?.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
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

    card.append(top);
    stats.append(card);
  });

  intro.append(stats);
  host.append(intro);

  const heading = document.createElement('h2');
  heading.className = 'section-heading an a5';
  // No "12 themes" label beside it: Rosie's 8 Oct deck asked for it to go (THE-401).
  heading.textContent = 'Explore by Theme';
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

    // The pill is the card's heading. It used to say "Theme 4" with the name
    // repeated underneath; the client asked for the name here and once.
    const tag = document.createElement('h3');
    tag.className = 'theme-tag';
    tag.textContent = theme.name;

    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.append(arrowIcon(14));

    // The tag and the arrow share a row that the rest of the card hangs below.
    const top = document.createElement('div');
    top.className = 'tt';
    top.append(tag, arrow);

    // Empty, but present and height-reserved in CSS, so the figures landing a
    // moment later move nothing on the page. The picture goes in now, on the
    // right, for the same reason; the figures go in front of it.
    const slot = document.createElement('div');
    slot.className = 'tstats';
    const picture = PICTURES[theme.slug];
    if (picture) {
      // Decoration: the tag above names the theme, and the picture carries no figure. Cropped to one
      // frame, as PSB asked ("where you need to, crop the images"); landing.css sets each one's focus.
      const img = document.createElement('img');
      img.className = 'tpic';
      img.src = `/themes/${picture.file}`;
      img.alt = '';
      img.width = 88;
      img.height = 96;
      img.decoding = 'async';
      slot.append(img);
    }

    tile.append(top, slot);
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
    // In front of the picture, if the tile has one (THE-404).
    slot.prepend(left);
    return;
  }

  const headline = document.createElement('span');
  headline.className = 'tstat-v';
  headline.textContent = fmtPct(figures.headline);
  left.append(headline);

  // What the number is: a bare "58%" told the client nothing.
  const caption = figures.caption ?? figures.of;
  if (caption) {
    const of = document.createElement('span');
    of.className = 'tstat-of';
    of.textContent = caption;
    left.append(of);
  }

  const badge = document.createElement('span');
  if (figures.delta) {
    const { points, from } = figures.delta;
    // Direction from the number printed, not the raw one: a 0.4-point fall
    // prints as 0, and a red "down" pill reading "0pts" contradicts itself.
    const shown = roundHalfAway(points);
    badge.className = `tstat-d ${shown > 0 ? 'up' : shown < 0 ? 'down' : 'flat'}`;
    badge.textContent = `${fmtPts(points)} since ${from}`;
  } else {
    badge.className = 'tstat-d flat';
    badge.textContent = figures.note ?? '';
  }
  left.append(badge);
  // In front of the picture, which sits on the right where the line used to be: PSB's layout of
  // 22 Oct has no line (THE-404).
  slot.prepend(left);

  // The third of the three places. This page loads no charting library, so there
  // is no renderer chip to inherit — the card carries its own.
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.textContent = 'Illustrative';
  tile.append(chip);

  const shownPoints = figures.delta ? roundHalfAway(figures.delta.points) : 0;
  const reading = figures.delta
    ? `${fmtPct(figures.headline)} in ${figures.delta.to}, `
      + (shownPoints === 0
        ? `unchanged since ${figures.delta.from}`
        : `${shownPoints > 0 ? 'up' : 'down'} ${Math.abs(shownPoints)} point${Math.abs(shownPoints) === 1 ? '' : 's'} since ${figures.delta.from}`)
    : `${fmtPct(figures.headline)}${figures.note ? `, ${figures.note.toLowerCase()}` : ''}`;
  tile.setAttribute(
    'aria-label',
    `${theme.name}. ${caption ?? 'Illustrative figure'}: ${reading}. Illustrative figure, not a survey result.`,
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
