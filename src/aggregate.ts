// Combining percentages.
//
// This file exists to make one specific mistake unwriteable. The approved
// prototype computes its "average across sixteen countries" chip as the mean of
// the percentages it just drew, which weights a country of 300 interviews the
// same as one of 1,100. Percentages cannot be averaged: a combined figure is the
// sum of the numerators over the sum of the denominators, divided once at the
// end.
//
// The protection is the signature rather than a rule in a comment. `combine`
// never sees a percentage, so there is no way to hand it one and no shortcut to
// take. The only way to reach it is through a `Part`, and a `Part` cannot be
// built without saying how many people it is measured on.
//
// When the API is wired up, `partsOf` is deleted — real figures arrive carrying
// a weighted numerator and denominator already — and `combine` does not change.

/** One cell of a combination: a count over the count it was measured on. */
export interface Part {
  label: string;
  numerator: number;
  denominator: number;
}

export type Refusal =
  /** Nothing selected, so there is nothing to combine. */
  | 'no-parts'
  /** A part with no denominator. Dividing by it would invent a figure. */
  | 'zero-base';

export type Combined =
  | { ok: true; pct: number; base: number; parts: number }
  | { ok: false; reason: Refusal; message: string };

/**
 * The only way a combined percentage is produced, now and after the swap to real
 * data.
 *
 * There is deliberately no overload taking percentages. If you find yourself
 * wanting one, the figure you are reaching for is not a combination — it is an
 * average of percentages, and it is wrong.
 */
export function combine(parts: Part[]): Combined {
  if (parts.length === 0) {
    return { ok: false, reason: 'no-parts', message: 'Nothing selected, so there is no combined figure.' };
  }

  const base = parts.reduce((total, p) => total + p.denominator, 0);
  if (base <= 0) {
    return {
      ok: false,
      reason: 'zero-base',
      message: 'No respondents behind this selection, so there is no combined figure.',
    };
  }

  const numerator = parts.reduce((total, p) => total + p.numerator, 0);
  return {
    ok: true,
    pct: Math.round((numerator / base) * 1000) / 10,
    base,
    parts: parts.length,
  };
}

/**
 * The illustrative bridge, and the only place a percentage is turned back into a
 * count.
 *
 * Round zero has no numerators — the figures are generated as percentages — so
 * they are reconstructed here against the base each was drawn for. That
 * reconstruction is a property of the prototype, not of the arithmetic, which is
 * why it lives in its own function and why deleting it is the whole of the change
 * when real figures arrive.
 */
export function partsOf(cells: { label: string; pct: number; base: number }[]): Part[] {
  return cells.map((c) => ({
    label: c.label,
    numerator: (c.pct / 100) * c.base,
    denominator: c.base,
  }));
}
