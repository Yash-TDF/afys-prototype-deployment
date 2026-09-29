// Chart colours.
//
// These are the approved prototype's, not the deck's tile-divider colours, and
// round zero is asking the client to approve structure — so the charts should look
// like the ones they have already accepted.
//
// Which of theirs applies depends on what the chart is showing. A comparison or a
// scale takes the green / gold / rose triad below, its `CMP_PALETTE`. A single
// measurement takes the theme's own accent, which is why the deck's accents reach
// the charts as well as theme identity (tags, tile borders, the choropleth ramp).
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
 * The same scale for a five-point list whose fifth answer is a real one, with a
 * step mixed between gold and rose so the ramp still runs green to rose rather
 * than stopping short of it.
 */
export const SCALE_5 = [BRAND.green, BRAND.leaf, BRAND.gold, mix(BRAND.gold, BRAND.rose, 0.5), BRAND.rose];

/**
 * Which answers sit off the scale, read from the label rather than the position.
 *
 * Position is very nearly right: five of the six five-option lists end in "Don't
 * know" or "Not applicable". The sixth is T08_Q4, Mobile Data Coverage, whose
 * last option is "Not at all" — the answer given by people with no coverage at
 * all, and a real point on the scale. Grey means "did not answer" everywhere else
 * in the portal, so coluring that slice grey would have the chart report those
 * people as having given no answer.
 *
 * Deliberately narrow. It matches the non-answers the 2026 questionnaire actually
 * uses and nothing else — in particular it must not match "Not at all concerned"
 * or "Not at all likely", which are the fourth option of three other lists and
 * are answers like any other.
 */
export const OFF_SCALE_LABEL = /don.?t know|not applicable|refused|do not read/i;

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

/**
 * Relative luminance and contrast, WCAG 2.1.
 *
 * Here because a label drawn inside a bar cannot ask the stylesheet whether it is
 * readable — a canvas has no cascade — and because the bars are the theme's colour
 * now rather than a fixed green, so "white on a bar" stopped being a decision
 * anyone could make once and write down.
 */
const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex: string): number {
  const [r, g, b] = parse(hex).map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * White or ink for a label sitting on `background`, whichever is further from it.
 *
 * Not a lightness threshold: the dark option is the page's ink rather than black,
 * so the tipping point is not where a black-or-white test would put it — the
 * deck's red is dark enough to want black and still takes white against our ink.
 * Anything that is not a plain six-digit hex — a gradient, an rgba() — keeps the
 * white it has always had.
 */
export function labelInk(background: unknown): string {
  if (typeof background !== 'string' || !/^#[0-9a-f]{6}$/i.test(background)) return '#ffffff';
  return contrast('#ffffff', background) >= contrast(INK, background) ? '#ffffff' : INK;
}

/** What an answer means, as bands.yaml records it for the band that carries it. */
export type ColourRole = 'positive' | 'negative' | 'neutral' | 'dontknow' | 'categorical';

/**
 * The meanings that take a colour of their own. bands.yaml's `categorical` is a
 * plain option with no side: the theme's single accent on a one-series bar or
 * hbar, and a positional colour on a pie, a stacked bar or any chart with
 * several series. `palette()` in render.ts applies that; here it is "no side".
 */
const SIDED: ReadonlySet<string> = new Set(['positive', 'negative', 'neutral', 'dontknow']);

/**
 * The shades one side of a scale gets, strongest first: as many as the side has
 * answers, so a third answer never repeats the second's colour. Green to leaf
 * and on towards white for agreement; rose towards gold for opposition.
 */
function shades(role: 'positive' | 'negative', count: number): string[] {
  const [strong, weak] = role === 'positive' ? [BRAND.green, BRAND.leaf] : [BRAND.rose, mix(BRAND.gold, BRAND.rose, 0.5)];
  if (count <= 1) return [strong];
  if (count === 2) return [strong, weak];
  // Both pale ends go towards white. The negative side used to head for gold,
  // and its palest shade (#d79740) was a hair from the neutral gold (#d4a338).
  const pale = mix(weak, '#ffffff', 0.45);
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return t <= 0.5 ? mix(strong, weak, t * 2) : mix(weak, pale, (t - 0.5) * 2);
  });
}

/**
 * Colours for a list of answers, by meaning where the meaning is known.
 *
 * Green for agreement, support and the like; rose for their opposite; gold for a
 * midpoint; the off-scale grey for "Don't know". A second answer with the same
 * meaning takes a lighter shade of its colour, so "Strongly support" and
 * "Somewhat support" can be told apart while still reading as one side. The
 * client asked for exactly this rule (28 Sep): colour was being assigned by
 * position, so on a six-option pie "Neither" came out red and "Strongly oppose"
 * green.
 *
 * `positional` is the colour each answer would have had by position, which is
 * what an answer keeps when its meaning is not one of the four sides: a
 * categorical answer (events, sources, organisations, which bands.yaml defines
 * as "coloured by position"), a label no band claims, or a role this code does
 * not know. So a chart is never all one colour because its answers have no
 * side, and a typo in one label does not undo the colours of the others.
 */
export function roleColours(
  labels: string[],
  roles: Record<string, ColourRole> | null,
  positional: string[],
): string[] {
  const role = (label: string): string | null => {
    const r = roles?.[label];
    return r && SIDED.has(r) ? r : null;
  };
  // A scale's strongest answers sit at its two ends, and the list runs from one
  // end to the other: "Strongly support, Somewhat support, Neither, Somewhat
  // oppose, Strongly oppose", or "Very concerned, Somewhat concerned, Not very
  // concerned, Not at all concerned". So a side listed first reads strong-to-weak
  // and takes its shades from the front, and a side listed after the midpoint or
  // the other side reads weak-to-strong and takes them from the back. Which side
  // is which is not fixed: the negatives lead a concern scale and trail an
  // agreement scale.
  const total: Record<string, number> = {};
  const first: Record<string, number> = {};
  labels.forEach((label, i) => {
    const r = role(label);
    if (!r) return;
    total[r] = (total[r] ?? 0) + 1;
    first[r] ??= i;
  });
  const fromBack = (r: string): boolean =>
    labels.slice(0, first[r]).some((label) => { const o = role(label); return o !== null && o !== 'dontknow'; });
  const taken: Record<string, number> = {};
  return labels.map((label, i) => {
    const r = role(label);
    if (r === null) return positional[i] ?? positional[0] ?? OFF_SCALE;
    if (r === 'neutral') return BRAND.gold;
    if (r === 'dontknow') return OFF_SCALE;
    const n = taken[r] ?? 0;
    taken[r] = n + 1;
    const ramp = shades(r as 'positive' | 'negative', total[r]!);
    return ramp[fromBack(r) ? (total[r]! - 1 - n) : n]!;
  });
}
