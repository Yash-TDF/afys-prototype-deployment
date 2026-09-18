// The explorer: any question, any filters, drawn however you want it.
//
// The chart-type switch is the point of this view, and it is also the honest test
// of the library choice — the same view model has to survive being drawn as a
// bar, a line, a stack, a pie, a map and a table without special-casing.
//
// The shell is built once and only the middle is redrawn. That is not tidiness:
// the question search sits in the left rail, and rebuilding the rail on every
// keystroke would destroy the input the reader is typing into. The prev/next bar
// is built once for a different reason — it carries an aria-live region, and
// replacing the element that holds one means a screen reader sees a new region
// rather than a change to the old, and usually says nothing at all.
import { questions, theme, themes, type ChartSpec, type ChartType, type Question } from '../content';
import { renderFigure, type Figure } from '../charts/render';
import { buildViewModel, DEFAULT_FILTERS, type Filters, type ViewModel } from '../model';
import { filterBar } from './filters';
import { enhance } from './dropdown';

const SVG = 'http://www.w3.org/2000/svg';

const TYPES: { value: ChartType; label: string }[] = [
  { value: 'bar', label: 'Bars' },
  { value: 'hbar', label: 'Horizontal bars' },
  { value: 'line', label: 'Over time' },
  { value: 'stacked', label: 'Stacked' },
  { value: 'pie', label: 'Share' },
  { value: 'map', label: 'Map' },
  { value: 'table', label: 'Table' },
];

export function explorerView(host: HTMLElement, params: URLSearchParams): () => void {
  // The rail groups by theme, and prev/next walks the same sequence. Both read
  // this, so the order on screen and the order the arrow keys follow cannot drift.
  const ordered: Question[] = themes.flatMap((t) => questions.filter((q) => q.theme === t.order));

  let code = params.get('q') ?? ordered[0]!.code;
  let kind: ChartType = 'bar';
  let filters: Filters = { ...DEFAULT_FILTERS };
  let figure: Figure | null = null;
  let search = '';

  host.replaceChildren();

  const head = document.createElement('section');
  head.className = 'explorer-header';
  const h1 = document.createElement('h1');
  h1.textContent = 'Explore the data';
  head.append(h1);
  host.append(head);

  const layout = document.createElement('div');
  layout.className = 'elayout';

  // --- the left rail, built once -------------------------------------------
  const side = document.createElement('aside');
  side.className = 'qside';

  const sideHeading = document.createElement('h2');
  sideHeading.id = 'qside-heading';
  sideHeading.textContent = 'Questions';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'qsearch';
  searchWrap.append(magnifier());
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Search questions…';
  searchInput.setAttribute('aria-label', `Search all ${ordered.length} questions`);
  searchInput.addEventListener('input', () => {
    search = searchInput.value;
    renderList();
    syncNav();
  });
  searchWrap.append(searchInput);

  const listHost = document.createElement('div');
  listHost.setAttribute('aria-labelledby', sideHeading.id);

  side.append(sideHeading, searchWrap, listHost);
  layout.append(side);

  // --- the right column ----------------------------------------------------
  const main = document.createElement('div');
  main.className = 'emain';

  // Redrawn wholesale; the bar below it is not.
  const content = document.createElement('div');

  const nav = document.createElement('div');
  nav.className = 'qnav';
  const prev = navButton('Previous', 'M15 18l-6-6 6-6', 'before');
  const next = navButton('Next', 'M9 18l6-6-6-6', 'after');
  const position = document.createElement('span');
  position.className = 'qnav-pos';
  position.setAttribute('aria-live', 'polite');
  const hint = document.createElement('span');
  hint.className = 'khint';
  hint.setAttribute('aria-hidden', 'true');
  // Outside the live region on purpose: it never changes, and announcing "left
  // right to navigate" after every question would be noise.
  hint.append(kbd('←'), kbd('→'), ' to navigate');
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  nav.append(prev, position, hint, next);

  main.append(content, nav);
  layout.append(main);
  host.append(layout);

  // --- behaviour -----------------------------------------------------------

  /** The questions the rail is showing: all of them, or those matching the search. */
  function visible(): Question[] {
    const term = search.trim().toLowerCase();
    if (!term) return ordered;
    return ordered.filter((q) =>
      q.label.toLowerCase().includes(term)
      || q.text.toLowerCase().includes(term)
      || q.code.toLowerCase().includes(term));
  }

  function step(delta: number): void {
    const list = visible();
    if (list.length === 0) return;
    const at = list.findIndex((q) => q.code === code);
    // Searching can put the current question out of the list. Stepping from
    // nowhere lands on the first or last match rather than doing nothing.
    const to = at === -1 ? (delta > 0 ? 0 : list.length - 1) : at + delta;
    if (to < 0 || to >= list.length) return;
    code = list[to]!.code;
    draw();
  }

  function renderList(): void {
    listHost.replaceChildren();
    const list = visible();

    if (list.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'qempty';
      empty.textContent = 'No questions match';
      listHost.append(empty);
      return;
    }

    for (const t of themes) {
      const inTheme = list.filter((q) => q.theme === t.order);
      // A heading with nothing under it reads as a theme with no questions.
      if (inTheme.length === 0) continue;

      const block = document.createElement('div');
      block.className = 'qside-theme';
      const name = document.createElement('h3');
      name.textContent = t.name;
      const items = document.createElement('ul');
      for (const q of inTheme) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = q.label;
        button.setAttribute('aria-current', String(q.code === code));
        button.addEventListener('click', () => { code = q.code; draw(); });
        li.append(button);
        items.append(li);
      }
      block.append(name, items);
      listHost.append(block);
    }
  }

  function syncNav(): void {
    const list = visible();
    const at = list.findIndex((q) => q.code === code);
    prev.disabled = at <= 0;
    next.disabled = at === -1 || at >= list.length - 1;

    position.replaceChildren();
    if (at === -1) {
      position.append(`${list.length} matching`);
    } else {
      const here = document.createElement('strong');
      here.textContent = String(at + 1);
      const total = document.createElement('strong');
      total.textContent = String(list.length);
      position.append(here, ' of ', total);
    }
  }

  function draw(): void {
    figure?.destroy();
    content.replaceChildren();

    const found = ordered.find((q) => q.code === code) ?? ordered[0]!;
    const parent = themes.find((t) => t.order === found.theme)!;
    host.style.setProperty('--accent', parent.accent);

    const picker = document.createElement('label');
    picker.className = 'field field-wide epicker';
    const pickerLabel = document.createElement('span');
    pickerLabel.textContent = 'Question';
    const select = document.createElement('select');
    for (const t of themes) {
      const group = document.createElement('optgroup');
      group.label = t.name;
      for (const q of questions.filter((item) => item.theme === t.order)) {
        const option = document.createElement('option');
        option.value = q.code;
        option.textContent = `${q.code} · ${q.label}`;
        option.selected = q.code === found.code;
        group.append(option);
      }
      select.append(group);
    }
    select.addEventListener('change', () => { code = select.value; draw(); });
    picker.append(pickerLabel, select);
    enhance(picker, select, 'questions');
    content.append(picker);

    const wording = document.createElement('blockquote');
    wording.className = 'question-text';
    wording.textContent = found.text;
    content.append(wording);

    if (found.baseType === 'filtered' && found.baseText) {
      const base = document.createElement('p');
      base.className = 'base-note';
      base.textContent = `Asked only of: ${found.baseText}`;
      content.append(base);
    }

    // Kept on `map` and `line` deliberately: a map still needs a wave, and the
    // line chart ignores the wave filter rather than hiding it, which is what the
    // portal will do.
    content.append(filterBar(filters, (nextFilters) => { filters = nextFilters; draw(); }));

    const switcher = document.createElement('div');
    switcher.className = 'type-switch';
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', 'Chart type');
    for (const option of TYPES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.className = option.value === kind ? 'active' : '';
      button.setAttribute('aria-pressed', String(option.value === kind));
      button.addEventListener('click', () => { kind = option.value; draw(); });
      switcher.append(button);
    }
    content.append(switcher);

    const spec: ChartSpec = {
      theme: found.theme,
      order: 1,
      title: found.label,
      type: kind,
      questions: [found.code],
      // A map and a country bar chart are both "one value per country"; a line is
      // "one value per wave"; everything else is the distribution.
      comparison: kind === 'map' || kind === 'bar' ? 'country' : kind === 'line' ? 'tracked' : 'none',
      slide: null,
      caveat: null,
      showing: null,
    };

    const model: ViewModel = buildViewModel(spec, theme(parent.slug)!, filters);
    const holder = document.createElement('div');
    holder.className = kind === 'map' ? 'explorer-figure explorer-figure-map' : 'explorer-figure';
    content.append(holder);
    figure = renderFigure(holder, model, kind, parent.accent);

    content.append(exports(model, found.code));

    renderList();
    syncNav();
  }

  // Left and right move through the questions on screen. The guard is wider than
  // a tag check: our own picker draws its options as buttons, so arrow keys
  // inside an open one belong to the picker, not to this.
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || target?.isContentEditable) return;
    if (target?.closest('.picker-pop') || document.querySelector('.field.is-open')) return;
    event.preventDefault();
    step(event.key === 'ArrowLeft' ? -1 : 1);
  };
  document.addEventListener('keydown', onKey);

  draw();

  // The listener is removed here. One added per visit and never taken away is how
  // a view that has been navigated away from goes on answering key presses.
  return () => {
    document.removeEventListener('keydown', onKey);
    figure?.destroy();
  };
}

function magnifier(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const circle = document.createElementNS(SVG, 'circle');
  circle.setAttribute('cx', '11');
  circle.setAttribute('cy', '11');
  circle.setAttribute('r', '7');
  const handle = document.createElementNS(SVG, 'path');
  handle.setAttribute('d', 'm21 21-4.3-4.3');
  svg.append(circle, handle);
  return svg;
}

function navButton(label: string, path: string, where: 'before' | 'after'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'qnav-btn';
  button.setAttribute('aria-label', `${label} question`);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const chevron = document.createElementNS(SVG, 'path');
  chevron.setAttribute('d', path);
  svg.append(chevron);
  if (where === 'before') button.append(svg, label);
  else button.append(label, svg);
  return button;
}

function kbd(text: string): HTMLElement {
  const key = document.createElement('span');
  key.className = 'kbd';
  key.textContent = text;
  return key;
}

/** The download row. Wired up because "can I have this as an image" arrives on day one. */
function exports(model: ViewModel, code: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'exports';

  const csv = document.createElement('button');
  csv.type = 'button';
  csv.textContent = 'Download CSV';
  csv.addEventListener('click', () => {
    const header = ['Category', ...model.series.map((s) => s.label)].join(',');
    const lines = model.categories.map((category, i) =>
      [quote(category), ...model.series.map((s) => s.values[i] ?? '')].join(','));
    const meta = [
      `# ${model.title}`,
      '# ILLUSTRATIVE FIGURES — NOT SURVEY RESULTS',
      `# Base: ${model.base.toLocaleString('en-GB')} respondents`,
      ...(model.likeForLike ? [`# ${model.likeForLike}`] : []),
    ];
    download(`${code}.csv`, [...meta, header, ...lines].join('\n'), 'text/csv');
  });

  const png = document.createElement('button');
  png.type = 'button';
  png.textContent = 'Download image';
  png.addEventListener('click', () => {
    const canvas = document.querySelector<HTMLCanvasElement>('.explorer-figure canvas');
    if (!canvas) return;
    download(`${code}.png`, null, '', canvas.toDataURL('image/png'));
  });

  row.append(csv, png);
  return row;
}

const quote = (value: string): string => (value.includes(',') ? `"${value.replace(/"/g, '""')}"` : value);

function download(name: string, body: string | null, mime: string, dataUrl?: string): void {
  const href = dataUrl ?? URL.createObjectURL(new Blob([body ?? ''], { type: mime }));
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  link.click();
  if (!dataUrl) URL.revokeObjectURL(href);
}
