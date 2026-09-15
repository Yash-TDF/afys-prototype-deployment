// Turns a chart specification from the deck into something drawable.
//
// This is the piece that will be replaced by an API call. Keeping it separate
// from the drawing code means that swap touches one file: the shape below is
// deliberately close to what `GET /questions/:code/data` returns — a list of
// series, plus the metadata a reader is owed (the base, the caveat, and whether
// a cross-wave comparison was restricted).
import {
  type ChartSpec, type Question, type Theme, inWave, latestWave, likeForLike, question, waves,
} from './content';
import { base, distribution, headline, multi, optionsFor, trend } from './illustrative';

export interface Series { label: string; values: number[]; }

/**
 * What the categories along the axis are.
 *
 * The drawing code needs this to colour honestly: sixteen countries ranked
 * against each other are one measurement and take one colour, while four points
 * on an agreement scale are different answers and take the scale's colours.
 * Cycling a palette across country names implies a difference that is not there.
 */
export type CategoryKind = 'countries' | 'options' | 'waves';

export interface ViewModel {
  title: string;
  /** What the chart is plotting, in the deck's own words where it gives them. */
  showing: string | null;
  categories: string[];
  series: Series[];
  /** Restriction footnote — present whenever waves are compared. */
  likeForLike: string | null;
  caveats: string[];
  /** True when we invented the response options because the deck does not record them. */
  optionsInvented: boolean;
  base: number;
  question: Question | undefined;
  categoryKind: CategoryKind;
}

export interface Filters {
  wave: number;
  countries: string[];
  gender: 'all' | 'male' | 'female';
}

export const DEFAULT_FILTERS: Filters = { wave: latestWave, countries: [], gender: 'all' };

const key = (parts: (string | number)[]) => parts.join('~');

// Stand-ins for a multi-select list the deck does not spell out. Flagged on the
// chart as placeholders, like every other invented option set.
const MULTI_PLACEHOLDER = [
  'Jobs and employment', 'Education', 'Healthcare', 'Infrastructure',
  'Ending corruption', 'Security', 'Agriculture and food', 'Technology access',
  'Regional trade', 'Climate resilience',
];

export function buildViewModel(spec: ChartSpec, theme: Theme, filters: Filters): ViewModel {
  const q = question(spec.questions[0] ?? '');
  const text = q?.text ?? spec.title;
  const options = optionsFor(spec.questions[0] ?? spec.title, text, spec.showing);
  const caveats = (spec.caveat ?? '').split('|').map((c) => c.trim()).filter(Boolean);
  const scope = filters.countries.length > 0 ? filters.countries : ['Africa'];
  const seed = key([theme.slug, spec.order, filters.wave, filters.gender, scope.join('+')]);

  const common = {
    title: spec.title,
    showing: spec.showing,
    caveats,
    optionsInvented: options.illustrative,
    base: base(seed),
    question: q,
  };

  // A multi-select question is a ranking rather than a distribution: the deck
  // asks for "Top 10 for 2026", which is ten options in one wave, not one option
  // across four. The exception is a per-country view — a map or a country bar
  // chart plots one option across countries, and its categories must stay
  // country names or the map has nothing to colour.
  if (q?.responseType === 'multi' && spec.comparison !== 'country') {
    const cells = multi(seed, options.labels.length > 4 ? options.labels : MULTI_PLACEHOLDER).slice(0, 10);
    return {
      ...common,
      categories: cells.map((c) => c.label),
      series: [{ label: spec.showing ?? 'Share choosing each option', values: cells.map((c) => c.pct) }],
      likeForLike: null,
      categoryKind: 'options',
      // Respondents pick more than one, so these do not sum to 100. The real
      // portal will look exactly like this, and it is better queried now.
      caveats: [...caveats, 'Respondents could choose more than one answer, so these do not total 100%.'],
    };
  }

  // Tracked over waves: one line per option, restricted to the countries present
  // in every wave being compared — the restriction the real portal applies.
  if (spec.comparison === 'tracked') {
    const years = waves.map((w) => w.year).filter((y) => !notAsked(caveats).has(y));
    const shared = likeForLike(years);
    const labels = options.labels.slice(0, 3);
    const series = labels.map((label) => ({ label, values: trend(key([seed, label]), years) }));
    // A stacked bar is a distribution: the segments of one bar are shares of the
    // same respondents and have to total 100. Drawing three independent trends and
    // stacking them produces bars that run past the axis — which is exactly the
    // kind of number nobody questions until it is published.
    if (spec.type === 'stacked') normalise(series, years.length);
    return {
      ...common,
      categories: years.map(String),
      series,
      categoryKind: 'waves',
      // The deck already carries this restriction in its own words on most of
      // these charts. Saying it twice makes both copies look like boilerplate.
      likeForLike: caveats.some((c) => c.toLowerCase().includes('comparing only'))
        ? null
        : `Comparing only the ${shared.length} countries surveyed in ${years.join(', ')}, `
          + 'so figures differ from the single-wave totals.',
    };
  }

  // Per country: one bar per country surveyed in the selected wave.
  if (spec.comparison === 'country') {
    const surveyed = inWave(filters.wave)
      .filter((c) => filters.countries.length === 0 || filters.countries.includes(c.name));
    const label = options.labels[0] ?? 'Selected';
    const rows = surveyed
      .map((c) => ({ name: c.name, value: headline(key([seed, c.name, label])) }))
      .sort((a, b) => b.value - a.value);
    return {
      ...common,
      categories: rows.map((r) => r.name),
      series: [{ label: spec.showing ?? label, values: rows.map((r) => r.value) }],
      likeForLike: null,
      categoryKind: 'countries',
    };
  }

  // A single distribution across the response options.
  const cells = q?.responseType === 'multi'
    ? multi(seed, options.labels).slice(0, 10)
    : distribution(seed, options.labels);
  return {
    ...common,
    categories: cells.map((c) => c.label),
    series: [{ label: spec.showing ?? 'Share of respondents', values: cells.map((c) => c.pct) }],
    likeForLike: null,
    categoryKind: 'options',
  };
}

/**
 * Waves the deck says the question was not asked in.
 *
 * Several slides carry a note like "Question not asked in 2020 or 2022". Plotting
 * those years anyway would put a bar where the survey has nothing — the exact
 * mistake the portal's absence-is-not-zero rule exists to prevent, and it would
 * be visible to the client on a slide they wrote themselves.
 */
function notAsked(caveats: string[]): Set<number> {
  const out = new Set<number>();
  for (const caveat of caveats) {
    const match = /not asked in ([0-9,\sor]+)/i.exec(caveat);
    if (!match) continue;
    for (const year of match[1]!.match(/\d{4}/g) ?? []) out.add(Number(year));
  }
  return out;
}

/** Rescale each category so the series drawn on top of each other total 100. */
function normalise(series: Series[], categories: number): void {
  for (let i = 0; i < categories; i += 1) {
    const total = series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0);
    if (total === 0) continue;
    let running = 0;
    series.forEach((s, j) => {
      const value = j === series.length - 1
        ? Math.round((100 - running) * 10) / 10       // last segment absorbs the rounding
        : Math.round(((s.values[i] ?? 0) / total) * 1000) / 10;
      s.values[i] = value;
      running = Math.round((running + value) * 10) / 10;
    });
  }
}

/** One value per country, for the map. */
export function mapValues(seed: string, wave: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of inWave(wave)) out.set(c.name, headline(key([seed, c.name, wave])));
  return out;
}
