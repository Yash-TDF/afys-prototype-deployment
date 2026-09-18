// The header carries a wave badge. It is the one piece of chrome that names a
// wave, so it has to name the wave the page below it is showing: a header
// reading 2026 over a page of 2024 figures is a caption that contradicts its
// chart, and a reader has no way to tell which one is wrong.
//
// Each view owns its own wave — methodology has a toggle, the explorer and the
// tile pages have a filter bar — so rather than let them reach into the header's
// markup, they call this.
import { latestWave } from './content';

/** Name `year` in the header badge. Called with no argument, it goes back to the latest wave. */
export function showWave(year: number = latestWave): void {
  const el = document.querySelector<HTMLElement>('.wave-pill strong');
  if (el) el.textContent = String(year);
}
