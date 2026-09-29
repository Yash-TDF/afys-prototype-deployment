// Figures as the page prints them: whole numbers.
//
// The client asked for whole numbers everywhere (28 Sep). Rounding happens here,
// at the point of printing, and nowhere earlier: the figures themselves keep
// their precision, so a bar's width, a table's sort order and a sparkline's
// shape follow the real value, and a combined figure is rounded once, from the
// combination, rather than assembled from parts that were each rounded first.
// That is also what the production portal will do, from numerators and
// denominators; and the client's own deck rounds each figure on its own (slide
// 46 prints 48 + 49 + 4 = 101), so rows that do not sum to exactly 100 are the
// expected shape, not a defect.

/**
 * Round half away from zero. `Math.round(-5.5)` is -5, which would print a fall
 * of 5.5 points as "-5pts" and a rise of the same size as "+6pts". Tile deltas go
 * negative, so the rule has to be stated.
 */
export const roundHalfAway = (n: number): number => Math.sign(n) * Math.round(Math.abs(n));

/** "58%": a percentage, whole. */
export const fmtPct = (n: number): string => `${roundHalfAway(n)}%`;

/** "+11pts" or "-4pts": a change in percentage points, signed and whole. */
export function fmtPts(n: number): string {
  const whole = roundHalfAway(n);
  return `${whole > 0 ? '+' : ''}${whole}pts`;
}
