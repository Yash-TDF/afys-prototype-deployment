// A single-slot status message.
//
// The element lives in index.html rather than in a view, for the same reason the
// banner and the sparkline gradient do: the router replaces #view wholesale, and
// a toast raised by an action that changes the route would be destroyed before it
// could be read.
//
// role="status" with aria-live="polite" is on the element itself and never
// replaced, so a screen reader announces the text as a change to a region it
// already knows about. Rebuilding the element per message would announce nothing.

const VISIBLE_MS = 2200;

let timer: number | undefined;

export function toast(message: string): void {
  const el = document.getElementById('toast');
  if (!el) return;

  el.textContent = message;
  el.classList.add('show');

  // Module-scoped rather than the prototype's window._tt: two toasts in quick
  // succession must reset one timer, not leave the first one to hide the second.
  window.clearTimeout(timer);
  timer = window.setTimeout(() => el.classList.remove('show'), VISIBLE_MS);
}
