// Find any question from anywhere, with the / key.
//
// Forty-one questions across twelve themes is more than a rail can show at once,
// and the question you want is usually one you can half-remember the wording of.
// This is the approved prototype's palette, with three changes.
//
// Its openSpotlight() begins `if (!authed) return` — we build no authentication,
// so that goes. Its picker resets three globals on the way out (chart type, sort
// column, sort direction) because its state lives in module variables; ours sets
// the URL and lets the router rebuild from it. And its results are built by
// concatenating markup, with an escapeHTML() to make that safe — ours builds
// nodes, so the question wordings cannot become markup in the first place.
//
// Loaded on demand. The landing page is the one every visitor waits for, and it
// should not carry a search it has not been asked for.
import { questions, themeOf, type Question } from '../content';

const LIMIT = 40;

interface Hit {
  question: Question;
  theme: string;
  accent: string;
  /** Where the term was found — earlier is a better match. */
  at: number;
}

let root: HTMLElement | null = null;
let input: HTMLInputElement;
let list: HTMLElement;
let hits: Hit[] = [];
let active = 0;
let returnFocus: HTMLElement | null = null;

export function isOpen(): boolean {
  return root !== null && root.classList.contains('show');
}

export function open(): void {
  build();
  returnFocus = document.activeElement as HTMLElement | null;
  root!.classList.add('show');
  input.value = '';
  search();
  // Reading a layout property forces the style recalculation, so the wrap is out
  // of display:none by the next line. Without it the field is still in a hidden
  // subtree, focus() silently does nothing, and every keystroke goes to whatever
  // had focus before — which is how typing here ended up in the page behind.
  void root!.offsetHeight;
  input.focus();
}

export function close(): void {
  if (!root) return;
  root.classList.remove('show');
  // Focus goes back where it came from. Without this the reader is returned to
  // the top of the document, having merely looked something up.
  returnFocus?.focus?.();
  returnFocus = null;
}

function build(): void {
  if (root) return;

  root = document.createElement('div');
  root.className = 'spotlight';

  const backdrop = document.createElement('div');
  backdrop.className = 'sp-bg';
  backdrop.addEventListener('click', close);

  const wrap = document.createElement('div');
  wrap.className = 'sp-wrap';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', 'Search questions');

  const card = document.createElement('div');
  card.className = 'sp-card';

  const row = document.createElement('div');
  row.className = 'sp-input-row';
  row.append(magnifier());
  input = document.createElement('input');
  input.className = 'sp-input';
  input.type = 'text';
  input.placeholder = 'Search questions…';
  input.setAttribute('aria-label', `Search all ${questions.length} questions`);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', 'sp-results');
  input.addEventListener('input', search);
  const esc = document.createElement('span');
  esc.className = 'sp-esc';
  esc.textContent = 'Esc';
  row.append(input, esc);

  list = document.createElement('div');
  list.className = 'sp-results';
  list.id = 'sp-results';
  list.setAttribute('role', 'listbox');

  const foot = document.createElement('div');
  foot.className = 'sp-foot';
  foot.append(hint('↑↓', 'to move'), hint('↵', 'to open'), hint('esc', 'to close'));

  card.append(row, list, foot);
  wrap.append(card);
  root.append(backdrop, wrap);
  document.body.append(root);

  root.addEventListener('keydown', onKey);
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (active < hits.length - 1) { active += 1; render(); }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (active > 0) { active -= 1; render(); }
  } else if (event.key === 'Enter') {
    event.preventDefault();
    pick(active);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    close();
  }
}

function search(): void {
  const term = input.value.toLowerCase().trim();
  const found: Hit[] = [];

  for (const question of questions) {
    const theme = themeOf(question);
    const haystack = `${question.label} ${question.text} ${question.code} ${theme?.name ?? ''}`.toLowerCase();
    const at = term ? haystack.indexOf(term) : 0;
    if (term && at < 0) continue;
    found.push({
      question,
      theme: theme?.name ?? '',
      accent: theme?.accent ?? '',
      at: term ? at : question.order,
    });
  }

  found.sort((a, b) => a.at - b.at);
  hits = found.slice(0, LIMIT);
  active = 0;
  render();
}

function render(): void {
  list.replaceChildren();

  if (hits.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'sp-empty';
    empty.textContent = 'No questions match';
    list.append(empty);
    input.setAttribute('aria-activedescendant', '');
    return;
  }

  const term = input.value.toLowerCase().trim();

  hits.forEach((hit, i) => {
    const row = document.createElement('div');
    row.className = i === active ? 'sp-result active' : 'sp-result';
    row.id = `sp-hit-${i}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(i === active));
    // One rule off the theme's own hex, instead of the prototype's six-name
    // accent enum and its six pairs of CSS rules.
    if (hit.accent) row.style.setProperty('--accent', hit.accent);

    const badge = document.createElement('span');
    badge.className = 'sp-badge';
    badge.textContent = hit.theme;

    const text = document.createElement('span');
    text.className = 'sp-q';
    highlight(text, hit.question.label, term);

    const enter = document.createElement('span');
    enter.className = 'sp-enter';
    enter.textContent = '↵ Open';

    row.append(badge, text, enter);
    row.addEventListener('click', () => pick(i));
    row.addEventListener('mouseenter', () => { active = i; render(); });
    list.append(row);
  });

  input.setAttribute('aria-activedescendant', `sp-hit-${active}`);
  list.querySelector('.sp-result.active')?.scrollIntoView({ block: 'nearest' });
}

/** The matched run in a <mark>, built as nodes so a question's wording stays text. */
function highlight(into: HTMLElement, text: string, term: string): void {
  if (!term) { into.textContent = text; return; }
  const at = text.toLowerCase().indexOf(term);
  if (at < 0) { into.textContent = text; return; }
  const mark = document.createElement('mark');
  mark.textContent = text.slice(at, at + term.length);
  into.append(text.slice(0, at), mark, text.slice(at + term.length));
}

function pick(index: number): void {
  const hit = hits[index];
  if (!hit) return;
  close();
  // The URL is the state. The prototype resets three module globals here and has
  // to remember all three; there is nothing to reset when the router rebuilds.
  window.location.hash = `#/explore?q=${hit.question.code}`;
}

function hint(key: string, label: string): HTMLElement {
  const span = document.createElement('span');
  const kbd = document.createElement('span');
  kbd.className = 'sp-kbd';
  kbd.textContent = key;
  span.append(kbd, ` ${label}`);
  return span;
}

function magnifier(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const circle = document.createElementNS(NS, 'circle');
  circle.setAttribute('cx', '11');
  circle.setAttribute('cy', '11');
  circle.setAttribute('r', '7');
  const handle = document.createElementNS(NS, 'path');
  handle.setAttribute('d', 'm21 21-4.3-4.3');
  svg.append(circle, handle);
  return svg;
}
