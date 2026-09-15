// Hash routing, so the prototype can be opened from a file server, a Vercel
// deployment or a laptop without any rewrite rules — and so a link to a
// particular theme or question survives being pasted into Slack.
import { themesView } from './views/themes';

// Every view except the landing page is imported on demand. The landing page is
// tiles and text — it should not download a charting library to render a grid of
// links, and on a slow connection that is the difference people feel.

const host = document.getElementById('view')!;
let teardown: () => void = () => {};

function route(): void {
  teardown();
  teardown = () => {};

  const hash = window.location.hash.replace(/^#/, '') || '/';
  const [path, query] = hash.split('?');
  const params = new URLSearchParams(query ?? '');
  const parts = (path ?? '/').split('/').filter(Boolean);

  document.body.dataset['route'] = parts[0] ?? 'themes';

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

  for (const link of document.querySelectorAll<HTMLAnchorElement>('.site-nav a')) {
    const target = link.getAttribute('href')!.replace(/^#/, '');
    const active = target === '/' ? parts.length === 0 : target.startsWith(`/${parts[0]}`);
    link.classList.toggle('active', active);
  }

  window.scrollTo(0, 0);
}

/** Hold the teardown of a view that is still loading, and drop it if we navigate away first. */
function load(pending: Promise<() => void>): void {
  const token = ++generation;
  host.replaceChildren(loading());
  void pending.then((dispose) => {
    if (token !== generation) { dispose(); return; }
    teardown = dispose;
  });
}

let generation = 0;

function loading(): HTMLElement {
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = 'Loading…';
  return p;
}

window.addEventListener('hashchange', route);
route();
