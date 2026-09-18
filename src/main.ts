// Hash routing, so the prototype can be opened from a file server, a Vercel
// deployment or a laptop without any rewrite rules — and so a link to a
// particular theme or question survives being pasted into Slack.
import { themesView } from './views/themes';
import { showWave } from './wave-badge';

// Every view except the landing page is imported on demand. The landing page is
// tiles and text — it should not download a charting library to render a grid of
// links, and on a slow connection that is the difference people feel.

/**
 * What a view hands back.
 *
 * `update` is optional and only the explorer implements it. Without it, going
 * back one step would tear the whole view down and build it again: the chart
 * destroyed and redrawn, the question search emptied, the rail scrolled to the
 * top. With it, Back and Forward move through questions and filters the way the
 * reader expects, because the same view is still there.
 */
export interface View {
  destroy(): void;
  update?(params: URLSearchParams): void;
}

type ViewResult = (() => void) | View;

const asView = (result: ViewResult): View =>
  (typeof result === 'function' ? { destroy: result } : result);

const host = document.getElementById('view')!;
let current: View | null = null;
let currentKey: string | null = null;

// The skip link moves focus rather than following an href, because every link on
// this page is a route and #view is not one. Without the focus call the button
// would do nothing at all for the reader it exists for.
document.querySelector<HTMLButtonElement>('.skip-link')
  ?.addEventListener('click', () => host.focus());

// --- the two overlays ------------------------------------------------------
//
// Both are imported the first time they are wanted. They are reachable from
// every view, which would ordinarily argue for loading them with the shell — but
// the shell is what the landing page waits for, and a reader who never presses /
// should never pay for the search.

let spotlight: typeof import('./ui/spotlight') | null = null;
let drawer: typeof import('./ui/drawer') | null = null;

async function openSearch(): Promise<void> {
  spotlight ??= await import('./ui/spotlight');
  spotlight.open();
}

async function openAbout(): Promise<void> {
  drawer ??= await import('./ui/drawer');
  drawer.open();
}

document.querySelector<HTMLButtonElement>('.nav-search')
  ?.addEventListener('click', () => void openSearch());
document.querySelector<HTMLButtonElement>('.nav-about')
  ?.addEventListener('click', () => void openAbout());

// `/` from anywhere, except where a slash is a character someone is typing. The
// same guard the explorer's arrow keys use: a tag check alone misses
// contenteditable, and the search box that opens here is itself an input, so this
// also stops the key reaching a palette that is already open.
document.addEventListener('keydown', (event) => {
  if (event.key !== '/') return;
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName.toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea' || target?.isContentEditable) return;
  event.preventDefault();
  void openSearch();
});

// --- routing ---------------------------------------------------------------

function route(): void {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const [path, query] = hash.split('?');
  const params = new URLSearchParams(query ?? '');
  const parts = (path ?? '/').split('/').filter(Boolean);
  const key = parts.join('/');

  document.body.dataset['route'] = parts[0] ?? 'themes';
  highlight(parts);

  // The same place with different state. Hand it to the view and leave it
  // standing — including the scroll position, because jumping to the top of the
  // page when someone steps back through a filter is not what Back means.
  if (key === currentKey && current?.update) {
    current.update(params);
    return;
  }

  // Back to the latest wave on every navigation: a view that has a wave names it
  // again as it draws, and one that has none (the landing page) should not be left
  // wearing the wave somebody chose on the page before. Below the update-in-place
  // return on purpose: a view left standing may decide it has nothing to redraw,
  // and would then be wearing a reset it never answered.
  showWave();

  current?.destroy();
  current = null;
  currentKey = key;

  if (parts[0] === 'theme' && parts[1]) {
    const slug = parts[1];
    load(import('./views/tile').then((m) => m.tileView(host, slug)));
  } else if (parts[0] === 'explore') {
    load(import('./views/explorer').then((m) => m.explorerView(host, params)));
  } else if (parts[0] === 'methodology') {
    load(import('./views/methodology').then((m) => m.methodologyView(host)));
  } else {
    themesView(host);
  }

  window.scrollTo(0, 0);
}

function highlight(parts: string[]): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('.site-nav a')) {
    const target = link.getAttribute('href')!.replace(/^#/, '');
    const active = target === '/' ? parts.length === 0 : target.startsWith(`/${parts[0]}`);
    link.classList.toggle('active', active);
  }
}

/** Hold the teardown of a view that is still loading, and drop it if we navigate away first. */
function load(pending: Promise<ViewResult>): void {
  const token = ++generation;
  host.replaceChildren(loading());
  void pending.then((result) => {
    const view = asView(result);
    if (token !== generation) { view.destroy(); return; }
    current = view;
  });
}

let generation = 0;

function loading(): HTMLElement {
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = 'Loading…';
  return p;
}

// pushState and replaceState do not fire this, which is the point: a view that
// records its own state in the URL is not told about the change it just made.
// Back and Forward do fire it, and that is when a view is asked to update.
window.addEventListener('hashchange', route);
route();
