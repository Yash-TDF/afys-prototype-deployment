// Chart colours.
//
// These are the approved prototype's, not the deck's tile-divider colours. The
// charts the client clicked through are drawn in a green / gold / rose triad, and
// round zero is asking them to approve structure — so the charts should look like
// the ones they have already accepted. The deck's accents are still used, but for
// theme identity (tags, tile borders, the choropleth ramp), which is what they
// were picked for.
export const BRAND = {
  green: '#2f7a5a',
  gold: '#d4a338',
  rose: '#e8536a',
  blue: '#60cbee',
  leaf: '#6dbf67',
  navy: '#1a3a2a',
} as const;

export const SERIES = [BRAND.green, BRAND.gold, BRAND.rose, BRAND.navy, BRAND.leaf, BRAND.blue];

/** The answer that is not on the scale — "Don't know", "Not applicable". */
export const OFF_SCALE = '#b9c0c8';

/** Agreement scales read strong-to-weak: agreement in green, disagreement in rose. */
export const SCALE_4 = [BRAND.green, BRAND.leaf, BRAND.gold, BRAND.rose];
export const SCALE_3 = [BRAND.green, BRAND.rose, OFF_SCALE];

/**
 * Slice colours for a pie with more options than the six above.
 *
 * A pie has no axis, so colour is the only thing identifying an arc — and its
 * last slice touches its first, which a row of bars never has to worry about.
 * The six come first and in their usual order, so a six-slice pie is the chart
 * the client has already approved. Past six the stops are mixed from pairs of
 * those same six rather than invented, in an order chosen by measuring every
 * neighbouring pair at every slice count that can occur, wrap included, rather
 * than by eye: the closest neighbours are further apart than green and navy,
 * which the charts already place side by side.
 *
 * Ten is the most a pie can show — a multi-select question is drawn as a Top 10
 * (see model.ts) and no single-select answer list is longer than nine. There are
 * sixteen stops here so that the ring is not the thing that breaks if that
 * changes.
 */
const PIE_STOPS = [
  ...SERIES,
  mix(BRAND.navy, BRAND.rose, 0.5),
  mix(BRAND.navy, BRAND.gold, 0.5),
  mix(BRAND.blue, BRAND.rose, 0.5),
  mix(BRAND.rose, BRAND.gold, 0.5),
  mix(BRAND.blue, BRAND.gold, 0.5),
  mix(BRAND.rose, BRAND.green, 0.65),
  mix(BRAND.leaf, BRAND.gold, 0.5),
  mix(BRAND.blue, BRAND.leaf, 0.35),
  mix(BRAND.leaf, BRAND.rose, 0.65),
  mix(BRAND.blue, BRAND.navy, 0.35),
];

export const pieStops = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => PIE_STOPS[i % PIE_STOPS.length]!);

export const GRID = '#e6e8ec';
export const INK = '#1f2337';
export const MUTED = '#6b7280';

/** Choropleth ramp — light to the theme's accent. */
export function ramp(accent: string): string[] {
  return ['#eef2f4', mix(accent, '#ffffff', 0.62), mix(accent, '#ffffff', 0.4), mix(accent, '#ffffff', 0.2), accent];
}

export function mix(a: string, b: string, t: number): string {
  const pa = parse(a);
  const pb = parse(b);
  const c = pa.map((v, i) => Math.round(v * (1 - t) + pb[i]! * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function parse(hex: string): number[] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export const NO_DATA = '#f2f4f6';
