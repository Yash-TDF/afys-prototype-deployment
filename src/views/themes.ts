// The landing view: what the survey is, then the twelve tiles.
//
// Two departures from the prototype the client has seen, both deliberate:
//
//   - The tiles are the deck's twelve. The live prototype still shows the 2024
//     report's chapter names — "Quality of Life", "Future Ambitions",
//     "Corruption" — which are not in the deck at all.
//   - Nothing on this page is a generated figure. The live prototype leads with
//     "RIGHT DIRECTION 55%", which is the report's *wrong*-direction number (the
//     right-direction figure on printed page 18 is 37%). Rather than replace one
//     invented headline with another, the summary row carries only facts we can
//     source: how many countries, how many waves, how many themes.
import { countries, inWave, latestWave, themes, waves } from '../content';

export function themesView(host: HTMLElement): void {
  host.replaceChildren();

  const intro = document.createElement('section');
  intro.className = 'hero';
  const h1 = document.createElement('h1');
  h1.textContent = 'Survey Overview';
  const lede = document.createElement('p');
  lede.textContent =
    `Explore findings across ${countries.length} countries and 14,000+ respondents `
    + `aged 18 to 24, surveyed in ${waves.length} waves since ${waves[0]!.year}.`;
  intro.append(h1, lede);

  const stats = document.createElement('div');
  stats.className = 'stat-row';
  const facts = [
    {
      label: 'Countries',
      value: String(countries.length),
      sub: `Sub-Saharan Africa · ${inWave(latestWave).length} surveyed in ${latestWave}`,
    },
    { label: 'Respondents', value: '14,000+', sub: 'Aged 18 to 24, in each wave' },
    { label: 'Survey waves', value: String(waves.length), sub: waves.map((w) => w.year).join(' · ') },
    { label: 'Themes', value: String(themes.length), sub: 'From the Portal Content deck' },
  ];
  for (const fact of facts) {
    const card = document.createElement('div');
    card.className = 'stat';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = fact.label;
    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = fact.value;
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = fact.sub;
    card.append(label, value, sub);
    stats.append(card);
  }
  intro.append(stats);
  host.append(intro);

  const heading = document.createElement('h2');
  heading.className = 'section-heading';
  heading.textContent = 'Explore by Theme';
  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = `${themes.length} themes`;
  heading.append(count);
  host.append(heading);

  const grid = document.createElement('section');
  grid.className = 'tile-grid';
  host.append(grid);

  for (const theme of themes) {
    const tile = document.createElement('a');
    tile.className = 'tile';
    tile.href = `#/theme/${theme.slug}`;
    tile.style.setProperty('--accent', theme.accent);

    const tag = document.createElement('span');
    tag.className = 'theme-tag';
    tag.textContent = `Theme ${theme.order}`;

    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '↗';
    arrow.setAttribute('aria-hidden', 'true');

    const name = document.createElement('h3');
    name.textContent = theme.name;

    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = `${theme.questions.length} question${theme.questions.length === 1 ? '' : 's'}`;

    const rule = document.createElement('hr');
    rule.className = 'rule';

    const charts = document.createElement('p');
    charts.className = 'meta';
    charts.textContent = `${theme.charts.length} chart${theme.charts.length === 1 ? '' : 's'} from the deck`;

    tile.append(tag, arrow, name, meta, rule, charts);
    grid.append(tile);
  }
}
