// Hash routing, so the prototype can be opened from a file server, a Vercel
// deployment or a laptop without any rewrite rules — and so a link to a
// particular theme or question survives being pasted into Slack.
import { themesView } from './views/themes';

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
