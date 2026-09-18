// The sample-size badge.
//
// The approved prototype grades every base into Strong, Moderate or Low against
// 400 and 100, and writes a tooltip reading "Margin of error ±3.5pts at 95%
// confidence. Strong base for country-level comparison." That is a real
// inferential claim: it says how far this measurement is likely to sit from the
// population value.
//
// Ours are not measurements. `illustrative.base()` is a hash of the question code
// mapped into 250-1150, so grading it would put the most confident-looking
// sentence on the page against the least real number on it — on the element most
// likely to be cropped into a deck. In round zero the badge shows the base, says
// it is illustrative, and stays grey.
//
// Two problems survive the arrival of real data, and the thresholds stay inert
// until both are answered: the formula assumes simple random sampling, while the
// survey is weighted and whether any weight is applied at all is still open with
// PSB; and a published margin of error needs a design effect, which a weighted
// multi-country sample certainly has.

/**
 * Margin of error at 95% confidence for a 50% proportion — the conservative
 * worst case, which is what a single badge over a whole chart has to assume.
 *
 * Kept, exported and correct, so that wiring real figures is a matter of passing
 * `illustrative: false` rather than reimplementing statistics under deadline.
 */
export function marginOfError(n: number): number | null {
  if (!n || n <= 0) return null;
  return 1.96 * Math.sqrt(0.25 / n) * 100;
}

/** Below this a country-level figure is not worth reporting on its own. */
const REPORTABLE = 400;
/** Below this it is directional at best. */
const DIRECTIONAL = 100;

export interface Badge {
  label: string;
  tone: 'neutral' | 'strong' | 'moderate' | 'low';
  tip: string;
}

export function sampleBadge(base: number, opts: { illustrative: boolean }): Badge {
  if (!base || base <= 0) {
    return {
      label: 'No data',
      tone: 'low',
      tip: 'No respondents match the current filters.',
    };
  }

  const n = base.toLocaleString('en-GB');

  if (opts.illustrative) {
    return {
      label: 'Illustrative base',
      tone: 'neutral',
      tip: `Base of ${n}, generated for layout. Not a survey result, so no margin `
        + 'of error is shown. With real figures this badge reports the margin of '
        + 'error and whether the base carries a country-level comparison.',
    };
  }

  const moe = marginOfError(base);
  const tone = base >= REPORTABLE ? 'strong' : base >= DIRECTIONAL ? 'moderate' : 'low';
  const reading = base >= REPORTABLE
    ? 'Carries a country-level comparison.'
    : base >= DIRECTIONAL
      ? 'Read country-level comparisons with caution.'
      : 'Too small to compare countries on — directional only.';

  return {
    label: tone === 'strong' ? 'Strong' : tone === 'moderate' ? 'Moderate' : 'Low',
    tone,
    tip: `Base ${n}. Margin of error about ±${moe!.toFixed(1)} points at 95% confidence. ${reading}`,
  };
}

/** The badge element. The tooltip is drawn by CSS from data-tip — no JS, no library. */
export function badgeElement(badge: Badge): HTMLElement {
  const el = document.createElement('span');
  el.className = `qbadge q-${badge.tone}`;
  el.textContent = badge.label;
  el.dataset['tip'] = badge.tip;
  // Hoverable for a mouse, reachable for a keyboard, and readable to a screen
  // reader without the tooltip: the same sentence is the accessible name.
  el.tabIndex = 0;
  el.setAttribute('role', 'note');
  el.setAttribute('aria-label', badge.tip);
  return el;
}
