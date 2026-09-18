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
import { type Part, partsOf } from './aggregate';

export interface Series {
  label: string;
  values: number[];
  /**
   * Unweighted n behind each value, aligned with `categories`.
   *
   * Null where the categories are not independent samples. Fifteen answer options
   * are fifteen cuts of one sample, so printing an n beside each would assert
   * fifteen denominators that do not exist — and would let something downstream
   * combine them as though they were separate measurements.
   */
  bases: number[] | null;
}

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

/**
 * What the categories along the axis are.
 *
 * The drawing code needs this to colour honestly: sixteen countries ranked
 * against each other are one measurement and take one colour, while four points
 * on an agreement scale are different answers and take the scale's colours.
 * Cycling a palette across country names implies a difference that is not there.
 */
export type CategoryKind = 'countries' | 'options' | 'waves';

/**
 * What the *series* are, as distinct from what the axis is.
 *
 * Needed because more than one series used to mean only one thing — waves — and
 * now it can mean Men and Women. Anything that describes a chart in words has to
 * say which, or a gender split is announced as a comparison of waves.
 */
export type SeriesKind = 'single' | 'options' | 'waves' | 'gender';

/** The dimension split into series. Never also a filter — see `coherent`. */
export type CompareBy = 'none' | 'wave' | 'gender';

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
  seriesKind: SeriesKind;
  compare: CompareBy;
  /** Why a requested comparison was not drawn. Shown on the figure, never swallowed. */
  compareNote: string | null;
}

export interface Filters {
  wave: number;
  countries: string[];
  gender: 'all' | 'male' | 'female';
  /** The region chosen in the filter bar, '' for none. Only for showing the choice: the figures use `countries`. */
  region: string;
  compare: CompareBy;
}

export const DEFAULT_FILTERS: Filters = {
  wave: latestWave, countries: [], gender: 'all', region: '', compare: 'none',
};

/**
 * The only legal reading of a Filters value.
 *
 * A dimension cannot be a filter and a split at the same time. Splitting by
 * gender while gender is still cut to 'female' would seed the "Men" series from
 * a female-only scope — two series that claim to be a comparison and are not.
 * The wave field is left alone: comparing waves within women is legitimate, and
 * keeping the value means leaving compare mode restores the wave you were on.
 */
export function coherent(filters: Filters): Filters {
  return filters.compare === 'gender' ? { ...filters, gender: 'all' } : filters;
}

const key = (parts: (string | number)[]) => parts.join('~');

// Stand-ins for a multi-select list the deck does not spell out. Flagged on the
// chart as placeholders, like every other invented option set.
const MULTI_PLACEHOLDER = [
  'Jobs and employment', 'Education', 'Healthcare', 'Infrastructure',
  'Ending corruption', 'Security', 'Agriculture and food', 'Technology access',
  'Regional trade', 'Climate resilience',
];

export function buildViewModel(spec: ChartSpec, theme: Theme, filters: Filters): ViewModel {
  const f = coherent(filters);
  if (f.compare === 'none') return single(spec, theme, f);

  const refusal = refuse(spec, f);
  if (refusal) return { ...single(spec, theme, { ...f, compare: 'none' }), compareNote: refusal };

  const parts = cuts(spec, f);
  return merge(parts.map((p) => single(spec, theme, p.filters)), parts.map((p) => p.label), f);
}

/**
 * When a comparison cannot be drawn honestly, and what to say instead.
 *
 * Each of these would otherwise produce a chart that looks fine and means
 * something else, which is worse than not drawing it.
 */
function refuse(spec: ChartSpec, filters: Filters): string | null {
  if (filters.compare === 'wave' && spec.comparison === 'tracked') {
    return 'This chart already plots every wave, so there is nothing to compare it against.';
  }
  // mapConfig reads series[0] and nothing else, so a split map would draw one
  // half of the comparison and label it as everyone. A pie has the same problem
  // for the same reason.
  if (spec.type === 'map') return 'A map draws one figure per country, so it cannot show two series at once.';
  if (spec.type === 'pie') return 'A share chart is one whole, so it cannot show two series at once.';
  return null;
}

/** The filter values a comparison expands into, one per series. */
function cuts(spec: ChartSpec, filters: Filters): { label: string; filters: Filters }[] {
  if (filters.compare === 'gender') {
    return [
      { label: 'Men', filters: { ...filters, gender: 'male', compare: 'none' } },
      { label: 'Women', filters: { ...filters, gender: 'female', compare: 'none' } },
    ];
  }
  const caveats = (spec.caveat ?? '').split('|').map((c) => c.trim()).filter(Boolean);
  const skip = notAsked(caveats);
  return waves
    .map((w) => w.year)
    .filter((year) => !skip.has(year))
    .map((year) => ({ label: String(year), filters: { ...filters, wave: year, compare: 'none' as const } }));
}

/**
 * Stack the cuts as series over one set of categories.
 *
 * Only the categories every cut measured survive. On a country axis compared
 * across waves that is exactly the like-for-like set — 2020 covered fourteen
 * markets and 2026 covers sixteen — and carrying the extras with a blank or a
 * zero for the years they were not asked is the absence-is-not-zero mistake in
 * its most believable form. Dropping them also means every series has a value
 * for every category, so there is no gap to render and nothing to guess at.
 *
 * Values are looked up by name rather than by position. The per-country branch
 * sorts by value and `multi` sorts descending, so cuts left in their own order
 * would put the Men and Women bars against different countries while looking
 * entirely reasonable.
 */
function merge(built: ViewModel[], labels: string[], filters: Filters): ViewModel {
  const first = built[0]!;

  const others = built.slice(1).map((model) => new Set(model.categories));
  const categories = first.categories.filter((name) => others.every((set) => set.has(name)));
  const dropped = first.categories.length - categories.length;

  const series: Series[] = built.map((model, i) => {
    const at = new Map(model.categories.map((name, index) => [name, index]));
    const source = model.series[0]!;
    const indexes = categories.map((name) => at.get(name)!);
    return {
      label: labels[i]!,
      values: indexes.map((index) => source.values[index]!),
      bases: source.bases ? indexes.map((index) => source.bases![index]!) : null,
    };
  });

  const years = labels.map(Number);
  const restriction = filters.compare === 'wave'
    ? `Comparing only the ${likeForLike(years).length} countries surveyed in ${labels.join(', ')}, `
      + 'so figures differ from the single-wave totals.'
      + (dropped > 0 ? ` ${dropped} shown here in some waves only have been left out.` : '')
    : first.likeForLike;

  return {
    ...first,
    categories,
    series,
    // Each cut is its own sample, so the chart's base is all of them together.
    base: series.every((s) => s.bases) ? sum(series.flatMap((s) => s.bases!)) : first.base,
    seriesKind: filters.compare === 'gender' ? 'gender' : 'waves',
    compare: filters.compare,
    compareNote: null,
    likeForLike: restriction,
  };
}

function single(spec: ChartSpec, theme: Theme, filters: Filters): ViewModel {
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
    // A single cut: one series, and no comparison. merge() overrides these when
    // several cuts are stacked together.
    seriesKind: 'single' as SeriesKind,
    compare: 'none' as CompareBy,
    compareNote: null,
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
      series: [{
        label: spec.showing ?? 'Share choosing each option',
        values: cells.map((c) => c.pct),
        bases: null,
      }],
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
    // One base per wave, shared by every series: the options are cuts of the same
    // interviews, so the denominator belongs to the year, not to the answer.
    const waveBases = years.map((year) => base(key([seed, 'n', year])));
    const series = labels.map((label) => ({
      label, values: trend(key([seed, label]), years), bases: waveBases,
    }));
    // A stacked bar is a distribution: the segments of one bar are shares of the
    // same respondents and have to total 100. Drawing three independent trends and
    // stacking them produces bars that run past the axis — which is exactly the
    // kind of number nobody questions until it is published.
    if (spec.type === 'stacked') normalise(series, years.length);
    return {
      ...common,
      categories: years.map(String),
      series,
      base: sum(waveBases),
      categoryKind: 'waves',
      // One line per answer option, so that is what the series are.
      seriesKind: 'options' as SeriesKind,
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
    // Base travels with its country through the sort. Computed afterwards against
    // the sorted names it would still line up, but only by accident — one more
    // sort key and every country would be carrying its neighbour's denominator.
    const rows = surveyed
      .map((c) => ({
        name: c.name,
        value: headline(key([seed, c.name, label])),
        base: base(key([seed, 'n', c.name])),
      }))
      .sort((a, b) => b.value - a.value);
    const countryBases = rows.map((r) => r.base);
    return {
      ...common,
      categories: rows.map((r) => r.name),
      series: [{ label: spec.showing ?? label, values: rows.map((r) => r.value), bases: countryBases }],
      // Sixteen countries are sixteen samples, so the chart's base is their total
      // rather than a figure of its own.
      base: sum(countryBases),
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
    series: [{ label: spec.showing ?? 'Share of respondents', values: cells.map((c) => c.pct), bases: null }],
    likeForLike: null,
    categoryKind: 'options',
  };
}

/** One row per category, for the table, the chips and the tooltips. */
export interface Row {
  label: string;
  value: number | undefined;
  base: number | null;
}

export function rows(model: ViewModel, seriesIndex = 0): Row[] {
  const series = model.series[seriesIndex];
  return model.categories.map((label, i) => ({
    label,
    value: series?.values[i],
    base: series?.bases?.[i] ?? null,
  }));
}

/**
 * The parts of a combined figure, or null when there is no honest combination to
 * make.
 *
 * Null is the answer for an option axis, and it is not a refusal to be handled at
 * runtime — it means the call cannot be constructed at all. Combining the fifteen
 * options of one question would be adding up cuts of a single sample as though
 * they were separate measurements.
 */
export function partsFor(model: ViewModel, seriesIndex = 0): Part[] | null {
  const series = model.series[seriesIndex];
  if (!series?.bases) return null;
  const cells = model.categories
    .map((label, i) => ({ label, pct: series.values[i], base: series.bases![i] }))
    .filter((c): c is { label: string; pct: number; base: number } =>
      c.pct !== undefined && c.base !== undefined);
  return partsOf(cells);
}

/**
 * The per-category bases, but only when every series agrees on them.
 *
 * A gender split is two samples with two different denominators, so a single
 * "Base (n)" column would attribute one series' base to both. Null there, and the
 * column is simply not drawn.
 */
export function sharedBases(model: ViewModel): number[] | null {
  const first = model.series[0]?.bases;
  if (!first) return null;
  const same = model.series.every((s) => s.bases
    && s.bases.length === first.length
    && s.bases.every((v, i) => v === first[i]));
  return same ? first : null;
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
