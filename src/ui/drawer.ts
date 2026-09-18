// What this survey is, reachable without leaving the chart you are reading.
//
// The approved prototype has a methodology drawer and so do we, but it holds
// almost none of the same content. Theirs is four kilobytes of hard-coded prose
// saying "2028 Scheduled", "30 countries", and carrying a named contact's email
// address — none of which survives contact with the seeds, where the waves are
// 2020 to 2026 and the countries are twenty-eight.
//
// It is also deliberately thin. src/views/methodology.ts already owns coverage:
// the map, the per-country detail, the written legend and the full table of
// twenty-eight countries across four waves. Restating any of that here would
// give one fact two homes, and they would disagree the first time either moved.
// So this summarises and links out.
//
// Loaded on demand, like the search: the landing page should not carry it.
import { countries, inWave, latestWave, questions, themes, waves } from '../content';

let root: HTMLElement | null = null;
let panel: HTMLElement;
let returnFocus: HTMLElement | null = null;

export function isOpen(): boolean {
  return root !== null && root.classList.contains('show');
}

export function open(): void {
  build();
  returnFocus = document.activeElement as HTMLElement | null;
  root!.classList.add('show');
  panel.removeAttribute('inert');
  // See the note in spotlight.open(): focus cannot enter a subtree the browser
  // still considers hidden, and inert has only just been lifted. Forcing the
  // style recalculation first means the close button really takes focus — which
  // is also what puts the Escape handler on this panel in the path of the key.
  void root!.offsetHeight;
  panel.querySelector<HTMLButtonElement>('.dr-close')?.focus();
}

export function close(): void {
  if (!root) return;
  root.classList.remove('show');
  for (const marked of root.querySelectorAll('.is-target')) marked.classList.remove('is-target');
  // inert rather than hidden-after-a-timer. The prototype sets hidden after
  // 400ms to match its slide-out, which leaves the panel in the tab order for
  // most of a second — and for a reader who has asked for less motion, where the
  // transition finishes in a hundredth of that, for far longer than it is
  // visible.
  panel.setAttribute('inert', '');
  returnFocus?.focus?.();
  returnFocus = null;
}

function build(): void {
  if (root) return;

  root = document.createElement('div');
  root.className = 'drawer-root';

  const backdrop = document.createElement('div');
  backdrop.className = 'dr-bg';
  backdrop.addEventListener('click', close);

  panel = document.createElement('aside');
  panel.className = 'dr';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'dr-title');
  panel.setAttribute('inert', '');

  const head = document.createElement('div');
  head.className = 'dr-head';
  const titles = document.createElement('div');
  const kicker = document.createElement('p');
  kicker.className = 'dr-sub';
  kicker.textContent = 'About the data';
  const title = document.createElement('h3');
  title.id = 'dr-title';
  title.textContent = 'African Youth Survey';
  titles.append(kicker, title);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'dr-close';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.textContent = '✕';
  closeButton.addEventListener('click', close);
  head.append(titles, closeButton);

  const body = document.createElement('div');
  body.className = 'dr-body';

  body.append(section('study-overview', 'Study overview', overview()));
  body.append(section('waves', 'Waves', waveTable()));
  body.append(section('countries-surveyed', `Countries surveyed in ${latestWave}`, countryChips()));
  body.append(section('themes', 'Themes', themeLinks()));
  body.append(section('figures', 'The figures', figuresNote()));

  panel.append(head, body);
  root.append(backdrop, panel);
  document.body.append(root);

  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
}

function section(id: string, heading: string, content: HTMLElement): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'dr-sec';
  // Matched by id, not by reading the heading back. The prototype finds its
  // sections by comparing h4 text to a string literal at the call site, so
  // renaming a heading silently scrolls nowhere.
  wrap.id = `dr-${id}`;
  const h = document.createElement('h4');
  h.textContent = heading;
  wrap.append(h, content);
  return wrap;
}

export function scrollTo(id: string): void {
  open();
  const target = document.getElementById(`dr-${id}`);
  // Asked for in script, `smooth` outranks the stylesheet's reduced-motion rule,
  // so the preference is read here as well.
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target?.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
  // The last two sections both sit within the drawer's final screenful, so
  // scrolling to either ends in the same place. The section that was asked for
  // is marked, which says where you were sent when the scroll position cannot.
  for (const marked of root!.querySelectorAll('.is-target')) marked.classList.remove('is-target');
  target?.classList.add('is-target');
}

function overview(): HTMLElement {
  const list = document.createElement('dl');
  list.className = 'dr-kv';
  const rows: [string, string][] = [
    ['Respondents', 'Aged 18 to 24'],
    ['Countries', `${countries.length} across ${waves.length} waves`],
    ['Latest wave', `${latestWave} · ${inWave(latestWave).length} countries`],
    ['Themes', String(themes.length)],
    ['Questions', String(questions.length)],
    ['Fielded by', 'PSB Insights'],
  ];
  for (const [term, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
  }
  return list;
}

function waveTable(): HTMLElement {
  const wrap = document.createElement('div');
  const table = document.createElement('table');
  table.className = 'dr-table';
  const head = document.createElement('tr');
  head.innerHTML = '<th scope="col">Wave</th><th scope="col">Countries</th>';
  table.append(head);
  for (const wave of waves) {
    const row = document.createElement('tr');
    const th = document.createElement('td');
    th.textContent = wave.label;
    const td = document.createElement('td');
    td.textContent = String(inWave(wave.year).length);
    row.append(th, td);
    table.append(row);
  }
  wrap.append(table);

  const link = document.createElement('a');
  link.className = 'dr-link';
  link.href = '#/methodology';
  link.textContent = 'See which countries, wave by wave';
  link.addEventListener('click', close);
  const p = document.createElement('p');
  p.append(link);
  wrap.append(p);
  return wrap;
}

function countryChips(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'dr-chips';
  for (const country of [...inWave(latestWave)].sort((a, b) => a.name.localeCompare(b.name))) {
    const chip = document.createElement('span');
    chip.className = 'dr-chip';
    chip.textContent = country.name;
    wrap.append(chip);
  }
  return wrap;
}

/** The twelve themes as links to their pages — the deck's own names and counts. */
function themeLinks(): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'dr-themes';
  for (const theme of themes) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'dr-link';
    link.href = `#/theme/${theme.slug}`;
    link.textContent = theme.name;
    link.addEventListener('click', close);
    const count = document.createElement('span');
    count.textContent = `${theme.questions.length} question${theme.questions.length === 1 ? '' : 's'}`;
    item.append(link, count);
    list.append(item);
  }
  return list;
}

function figuresNote(): HTMLElement {
  const wrap = document.createElement('div');
  const p = document.createElement('p');
  p.textContent =
    'Every figure on this site is generated for layout. None of it is a survey '
    + 'result, and nothing here should be read as one. The structure — the themes, '
    + 'the questions, the countries and the waves — comes from the client’s own '
    + 'Portal Content deck.';
  wrap.append(p);
  return wrap;
}
