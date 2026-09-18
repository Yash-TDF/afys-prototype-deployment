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
//
// The view records where it is in the URL, so a link to a question with filters
// applied can be pasted to someone else. Writes go through history.pushState and
// replaceState rather than assigning to location.hash: assigning fires
// hashchange, and the view would be told about a change it had just made.
import {
  inWave, questions, theme, themes, waves,
  type ChartSpec, type ChartType, type Question,
} from '../content';
import { renderFigure, type Figure } from '../charts/render';
import {
  buildViewModel, DEFAULT_FILTERS, type CompareBy, type Filters, type ViewModel,
} from '../model';
import type { View } from '../main';
import { csvEscape, copyText, downloadBlob, saveAs, slug } from '../ui/download';
import { toast } from '../ui/toast';
import { filterBar, REGIONS } from './filters';
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

const GENDERS: Filters['gender'][] = ['all', 'male', 'female'];
const COMPARES: CompareBy[] = ['none', 'wave', 'gender'];

interface State {
  code: string;
  kind: ChartType;
  filters: Filters;
}

export function explorerView(host: HTMLElement, params: URLSearchParams): View {
  // The rail groups by theme, and prev/next walks the same sequence. Both read
  // this, so the order on screen and the order the arrow keys follow cannot drift.
  const ordered: Question[] = themes.flatMap((t) => questions.filter((q) => q.theme === t.order));

  let state = parse(params, ordered);
  let figure: Figure | null = null;
  let search = '';

  host.replaceChildren();

  const head = document.createElement('section');
  head.className = 'explorer-header an';
  // Which theme the question on screen belongs to, in that theme's colour. Built
  // once and re-worded by draw(), so it changes colour in place rather than
  // being replaced.
  const themeBadge = document.createElement('span');
  themeBadge.className = 'theme-pill';
  const h1 = document.createElement('h1');
  h1.textContent = 'Explore the data';
  head.append(themeBadge, h1);
  host.append(head);

  const layout = document.createElement('div');
  layout.className = 'elayout';

  // --- the left rail, built once -------------------------------------------
  const side = document.createElement('aside');
  side.className = 'qside an a2';

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
  // Deliberately not in the URL. It is a way of finding a question, not a place
  // to come back to, and putting it in history would make Back step backwards
  // through the typing.
  searchInput.addEventListener('input', () => {
    search = searchInput.value;
    renderList();
    syncNav();
  });
  searchWrap.append(searchInput);

  const listHost = document.createElement('div');
  listHost.className = 'qlist';
  listHost.setAttribute('aria-labelledby', sideHeading.id);

  side.append(sideHeading, searchWrap, listHost);
  layout.append(side);

  // --- the right column ----------------------------------------------------
  const main = document.createElement('div');
  main.className = 'emain an a3';

  const content = document.createElement('div');
  content.className = 'estack';

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
  hint.append(kbd('←'), kbd('→'), ' to navigate');
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  nav.append(prev, position, hint, next);

  main.append(content, nav);
  layout.append(main);
  host.append(layout);

  // --- behaviour -----------------------------------------------------------

  function visible(): Question[] {
    const term = search.trim().toLowerCase();
    if (!term) return ordered;
    return ordered.filter((q) =>
      q.label.toLowerCase().includes(term)
      || q.text.toLowerCase().includes(term)
      || q.code.toLowerCase().includes(term));
  }

  /**
   * Record the current state in the URL.
   *
   * Push for a place — a different question, a different chart. Replace for an
   * adjustment to the place you are already at, so Back does not have to walk
   * through every filter change to leave the view.
   */
  function record(how: 'push' | 'replace'): void {
    const target = `#/explore?${query(state)}`;
    if (target === window.location.hash) return;
    window.history[how === 'push' ? 'pushState' : 'replaceState'](null, '', target);
  }

  function step(delta: number): void {
    const list = visible();
    if (list.length === 0) return;
    const at = list.findIndex((q) => q.code === state.code);
    // Searching can put the current question out of the list. Stepping from
    // nowhere lands on the first or last match rather than doing nothing.
    const to = at === -1 ? (delta > 0 ? 0 : list.length - 1) : at + delta;
    if (to < 0 || to >= list.length) return;
    state = { ...state, code: list[to]!.code };
    record('push');
    draw();
  }

  function renderList(): void {
    // Emptying a scroller puts it back at the top. Kept and handed back, so
    // choosing a question halfway down does not throw the list to its start.
    const scrolled = listHost.scrollTop;
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
        button.setAttribute('aria-current', String(q.code === state.code));
        button.addEventListener('click', () => {
          state = { ...state, code: q.code };
          record('push');
          draw();
        });
        li.append(button);
        items.append(li);
      }
      block.append(name, items);
      listHost.append(block);
    }
    listHost.scrollTop = scrolled;
    reveal();
  }

  // Bring the current question into the list's view — arriving from a link to
  // the fortieth question should not show the first ten. The list's own
  // scrollTop is set rather than calling scrollIntoView, which would scroll the
  // page as well whenever the rail is partly off screen.
  function reveal(): void {
    const active = listHost.querySelector<HTMLElement>('button[aria-current="true"]');
    if (!active) return;
    const box = listHost.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    // Before the rail sticks, its lower end is below the window, so the bottom
    // that counts is whichever comes first: the list's or the screen's.
    const floor = Math.min(box.bottom, window.innerHeight);
    if (item.top < box.top) listHost.scrollTop -= box.top - item.top + 12;
    else if (item.bottom > floor) listHost.scrollTop += item.bottom - floor + 12;
  }

  function syncNav(): void {
    const list = visible();
    const at = list.findIndex((q) => q.code === state.code);
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

  // Never records the URL: it is called by update(), which is itself the result
  // of a history navigation. Writing there would push a new entry while consuming
  // one, and Back would stop working.
  function draw(): void {
    figure?.destroy();
    content.replaceChildren();

    const found = ordered.find((q) => q.code === state.code) ?? ordered[0]!;
    const parent = themes.find((t) => t.order === found.theme)!;
    host.style.setProperty('--accent', parent.accent);
    themeBadge.textContent = `Theme ${parent.order} of ${themes.length} · ${parent.name}`;

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
    select.addEventListener('change', () => {
      state = { ...state, code: select.value };
      record('push');
      draw();
    });
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
    const bar = filterBar(state.filters, (nextFilters) => {
      state = { ...state, filters: nextFilters };
      record('replace');
      draw();
    });
    content.append(bar);

    const switcher = document.createElement('div');
    switcher.className = 'type-switch';
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', 'Chart type');
    for (const option of TYPES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.className = option.value === state.kind ? 'active' : '';
      button.setAttribute('aria-pressed', String(option.value === state.kind));
      button.addEventListener('click', () => {
        state = { ...state, kind: option.value };
        record('push');
        draw();
      });
      switcher.append(button);
    }
    // Inside the filter card, after the controls and before the row of applied
    // filters — one card for everything that changes the chart.
    bar.insertBefore(switcher, bar.querySelector('.ftags'));

    const spec: ChartSpec = {
      theme: found.theme,
      order: 1,
      title: found.label,
      type: state.kind,
      questions: [found.code],
      // A map and a country bar chart are both "one value per country"; a line is
      // "one value per wave"; everything else is the distribution.
      comparison: state.kind === 'map' || state.kind === 'bar' ? 'country'
        : state.kind === 'line' ? 'tracked' : 'none',
      slide: null,
      caveat: null,
      showing: null,
    };

    const model: ViewModel = buildViewModel(spec, theme(parent.slug)!, state.filters);
    const holder = document.createElement('div');
    holder.className = state.kind === 'map' ? 'explorer-figure explorer-figure-map' : 'explorer-figure';
    content.append(holder);
    figure = renderFigure(holder, model, state.kind, parent.accent);

    const downloads = exports(model, found.code, () => record('replace'));
    const caption = holder.querySelector('figcaption');
    // On the title's row. `.showing` takes a full row of its own, so going in
    // ahead of it keeps the buttons level with the title.
    if (caption) caption.insertBefore(downloads, caption.querySelector('.showing'));
    else content.append(downloads);

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

  // Put the state we actually opened with in the URL, so the link is shareable
  // before anything has been touched. Replace, not push: arriving somewhere is
  // not a step to go back from.
  record('replace');
  draw();

  return {
    // The listener is removed here. One added per visit and never taken away is
    // how a view that has been navigated away from goes on answering key presses.
    destroy: () => {
      document.removeEventListener('keydown', onKey);
      figure?.destroy();
    },
    update: (next: URLSearchParams) => {
      const parsed = parse(next, ordered);
      const canonical = query(parsed);

      // A stale or hand-edited link can name a question, wave or country we
      // cannot honour. parse() drops those, but without this the address bar
      // would go on claiming them — and a reader who copies the URL, or presses
      // Copy link, would pass on something that does not describe what they are
      // looking at. Replace, so correcting it costs no history entry.
      if (canonical !== next.toString()) {
        window.history.replaceState(null, '', `#/explore?${canonical}`);
      }

      // Back onto identical state still fires hashchange. Redrawing would
      // destroy and rebuild the chart for no change at all.
      if (canonical === query(state)) return;
      state = parsed;
      draw();
    },
  };
}

/**
 * Read state out of the query, keeping nothing we cannot honour.
 *
 * A hand-edited or stale link is the normal case here, not an attack: a country
 * that was not surveyed in the wave it is paired with would draw an empty chart,
 * and an empty chart is indistinguishable from a real finding of zero.
 */
function parse(params: URLSearchParams, ordered: Question[]): State {
  const code = params.get('q');
  const kind = params.get('chart');
  const waveParam = Number(params.get('wave'));
  const gender = params.get('gender');
  const region = params.get('region') ?? '';
  const compare = params.get('cmp');

  const wave = waves.some((w) => w.year === waveParam) ? waveParam : DEFAULT_FILTERS.wave;
  const surveyed = new Set(inWave(wave).map((c) => c.name));

  return {
    code: ordered.some((q) => q.code === code) ? code! : ordered[0]!.code,
    kind: TYPES.some((t) => t.value === kind) ? kind as ChartType : 'bar',
    filters: {
      wave,
      // Repeated params rather than one comma-joined value: the prototype packs
      // its country list into a single string, which breaks on any value holding
      // a separator. Nothing here has to know what is inside a country's name.
      countries: params.getAll('country').filter((name) => surveyed.has(name)),
      gender: GENDERS.includes(gender as Filters['gender']) ? gender as Filters['gender'] : 'all',
      region: region in REGIONS ? region : '',
      compare: COMPARES.includes(compare as CompareBy) ? compare as CompareBy : 'none',
    },
  };
}

/** The canonical query for a state — also how two states are compared. */
function query(state: State): string {
  const params = new URLSearchParams();
  params.set('q', state.code);
  if (state.kind !== 'bar') params.set('chart', state.kind);
  if (state.filters.wave !== DEFAULT_FILTERS.wave) params.set('wave', String(state.filters.wave));
  if (state.filters.region) params.set('region', state.filters.region);
  for (const name of state.filters.countries) params.append('country', name);
  if (state.filters.gender !== 'all') params.set('gender', state.filters.gender);
  if (state.filters.compare !== 'none') params.set('cmp', state.filters.compare);
  return params.toString();
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
function exports(model: ViewModel, code: string, sync: () => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'exports';
  const name = `${code}_${slug(model.title)}`;

  const csv = document.createElement('button');
  csv.type = 'button';
  csv.textContent = 'CSV';
  csv.setAttribute('aria-label', 'Download CSV');
  csv.addEventListener('click', () => {
    const header = ['Category', ...model.series.map((s) => csvEscape(s.label))].join(',');
    const lines = model.categories.map((category, i) =>
      [csvEscape(category), ...model.series.map((s) => s.values[i] ?? '')].join(','));
    const meta = [
      `# ${model.title}`,
      '# ILLUSTRATIVE FIGURES — NOT SURVEY RESULTS',
      `# Base: ${model.base.toLocaleString('en-GB')} respondents`,
      ...(model.likeForLike ? [`# ${model.likeForLike}`] : []),
    ];
    downloadBlob([...meta, header, ...lines].join('\n'), 'text/csv;charset=utf-8;', `${name}.csv`);
    toast('CSV downloaded');
  });

  const png = document.createElement('button');
  png.type = 'button';
  png.textContent = 'PNG';
  png.setAttribute('aria-label', 'Download PNG image');
  png.addEventListener('click', () => {
    const canvas = document.querySelector<HTMLCanvasElement>('.explorer-figure canvas');
    if (!canvas) {
      toast('This view has no chart to save');
      return;
    }
    saveAs(canvas.toDataURL('image/png'), `${name}.png`);
    toast('Image downloaded');
  });

  const link = document.createElement('button');
  link.type = 'button';
  link.textContent = 'Share';
  link.setAttribute('aria-label', 'Share: copy a link to this view');
  link.addEventListener('click', () => {
    sync();
    void copyText(window.location.href)
      .then((ok) => toast(ok ? 'Link copied' : 'Could not copy the link'));
  });

  row.append(csv, png, link);
  return row;
}
