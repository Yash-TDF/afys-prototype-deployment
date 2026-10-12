// Turns a chart specification from the deck into something drawable.
//
// This is the piece that will be replaced by an API call. Keeping it separate
// from the drawing code means that swap touches one file: the shape below is
// deliberately close to what `GET /questions/:code/data` returns — a list of
// series, plus the metadata a reader is owed (the base, the caveat, and whether
// a cross-wave comparison was restricted).
import {
  type ChartSpec, type Question, type Theme, askedIn, gridOf, inWave, latestWave, likeForLike,
  question, rowName, themes, waves,
} from './content';
import { base, distribution, headline, multi, optionsFor, trend } from './illustrative';
import type { ColourRole } from './charts/palette';
import { type Part, partsOf } from './aggregate';

export interface Series {
  label: string;
  /**
   * One per category. Null where nothing was measured: a grid row not asked in
   * this series' wave. Drawn as a gap and listed as not asked, never as zero.
   */
  values: (number | null)[];
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
export type CategoryKind = 'countries' | 'options' | 'waves' | 'rows';

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
  /**
   * What each answer option means, keyed by its label, when bands.yaml records
   * it; null otherwise. The drawing code colours by this rather than by
   * position, so "Neither" is never red and "Strongly oppose" never green.
   */
  roles: Record<string, ColourRole> | null;
  /**
   * Said in place of the chart when the view asks for a wave its rows were not
   * asked in, and null otherwise. A grid row asked only in 2026 has no 2022
   * figure, and drawing one, or a country bar chart of one, was a chart of
   * something the survey never measured (review of #20).
   */
  notAsked: string | null;
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

  // A gender split of a wave the rows were not asked in is two halves of
  // nothing: say so once, as the single view does.
  if (f.compare === 'gender' && spec.comparison !== 'tracked' && !askedInView(spec, f.wave)) {
    return single(spec, theme, { ...f, compare: 'none' });
  }

  const refusal = refuse(spec, f);
  if (refusal) return { ...single(spec, theme, { ...f, compare: 'none' }), compareNote: refusal };

  const parts = cuts(spec, f);
  if (parts.length === 0) return single(spec, theme, { ...f, compare: 'none' });
  // Men and women rank by everyone's figure, so splitting a list by sex keeps the
  // order of the same list unsplit (review of #27). Everyone's whole list, not its
  // top ten: an answer in both halves' ten but outside everyone's was asked, so it
  // has a figure to rank by (second review of #27).
  const ranked = rankedList(spec);
  const everyone = ranked && f.compare === 'gender' ? everyoneOf(spec, theme, f) : null;
  return merge(parts.map((p) => single(spec, theme, p.filters)), parts.map((p) => p.label), f, ranked, everyone);
}

/**
 * Everyone's figure for every answer, not only the ten a chart draws: what a split
 * by men and women ranks by. Exported for tools/verify-the-386.mjs, which checks
 * the split's bars against it.
 */
export function everyoneOf(spec: ChartSpec, theme: Theme, filters: Filters): ViewModel {
  return single(spec, theme, { ...coherent(filters), compare: 'none' }, Infinity);
}

/**
 * Don't know, Other, None of these and All other answers: always last on a ranked
 * list (THE-386). `optionsFor` adds "All other answers" to a quoted option list.
 */
const TRAILING = /^(don'?t know|dk\b|other\b|none of (these|the above)|all other answers)/i;

/**
 * The order a list of answers draws in, as indexes into `labels`: answers with a
 * figure largest first, then answers with no figure, then Don't know, Other, None
 * of these and All other answers. Within each group, and between equal figures,
 * the original order stands. The rule promised to the client on 28 and 29 Sep,
 * with Ishwar's answers on THE-386.
 *
 * The no-figure group is for an option the latest wave did not ask (Ishwar's
 * answer 3 on THE-386). It cannot happen in the prototype: every option has a
 * figure in every wave, and `merge` leaves out an answer a cut did not measure.
 * The portal knows each option's waves, so the rule goes to its API (THE-226).
 */
function rankOrder(labels: string[], values: (number | null | undefined)[]): number[] {
  const group = (i: number) => (TRAILING.test(labels[i]!) ? 2 : typeof values[i] === 'number' ? 0 : 1);
  return labels.map((_, i) => i).sort((a, b) => group(a) - group(b)
    || (group(a) === 0 ? (values[b] as number) - (values[a] as number) : 0)
    || a - b);
}

/**
 * Whether a single-answer question's answers are a list rather than a scale:
 * three or more, none of them positive or negative, and drawn by the deck as bars
 * or horizontal bars. T01_Q3, the most impactful events, is; "Strongly agree /
 * Somewhat agree / Disagree / DK" (T05_Q1) carries no role either, but the deck
 * draws it as a pie, and an Explore view of it as bars must not rank a scale.
 * Asked of the question, not of whatever chart Explore draws, so the theme pages
 * and Explore rank the same questions.
 */
const listCache = new Map<string, boolean>();
function isList(code: string): boolean {
  const cached = listCache.get(code);
  if (cached !== undefined) return cached;
  const q = question(code);
  const deck = themes.flatMap((t) => t.charts).find((c) => c.questions[0] === code && !gridOf(c.questions));
  let list = false;
  if (q && q.responseType !== 'multi' && deck && (deck.type === 'bar' || deck.type === 'hbar')) {
    const options = optionsFor(code, q.text, deck.showing);
    const roles = options.roles ? Object.values(options.roles) : [];
    list = options.labels.length >= 3 && !roles.some((role) => role === 'positive' || role === 'negative');
  }
  listCache.set(code, list);
  return list;
}

/**
 * A chart that ranks its answers: a list or a multi-select, drawn as bars. A
 * multi-select's "Over time" is drawn as bars too, because its categories are
 * answers, not waves (`render.ts`), so it ranks as well: Explore's T09_Q1 over
 * time had Don't know ninth of ten (review of #27).
 */
function rankedList(spec: ChartSpec): boolean {
  if (gridOf(spec.questions)) return false;
  const code = spec.questions[0] ?? '';
  const multi = question(code)?.responseType === 'multi';
  if (spec.type === 'line') return multi;
  if (spec.type !== 'bar' && spec.type !== 'hbar') return false;
  return multi || isList(code);
}

/**
 * The questions whose own wave lists decide which waves a view may show.
 *
 * Grid rows only. A row carries the waves the portal's crosswave.csv maps it in
 * (THE-315): Germany's influence was asked in 2026 alone, and the file holds
 * nothing for it in any other wave. Every other question keeps the prototype's
 * four illustrative waves, by decision (THE-347, finding 3: tiles 4, 6 and 9
 * will read "since 2022" once real data loads, and the prototype does not
 * pretend otherwise). A grid chart answers for all its rows; any other chart
 * for its first question, which is the one it draws.
 */
function rowsOf(spec: ChartSpec): Question[] {
  const codes = gridOf(spec.questions) ? spec.questions : spec.questions.slice(0, 1);
  return codes.map((code) => question(code)).filter((q): q is Question => Boolean(q?.parent));
}

/** Whether a view of this chart has anything to show for this wave. */
function askedInView(spec: ChartSpec, year: number): boolean {
  const rows = rowsOf(spec);
  return rows.length === 0 || rows.some((row) => askedIn(row, year));
}

/** "2026", "2024 and 2026", "2020, 2022 and 2024", with `last` as the final join. */
function listYears(years: number[], last = 'and'): string {
  return years.length < 2 ? years.join('') : `${years.slice(0, -1).join(', ')} ${last} ${years[years.length - 1]}`;
}

/** What is said in place of a chart of a wave the rows were not asked in. */
function notAskedNote(spec: ChartSpec, year: number): string {
  const rows = rowsOf(spec);
  const asked = waves.map((w) => w.year).filter((y) => askedInView(spec, y));
  const when = asked.length > 0 ? ` ${rows.length > 1 ? 'They were' : 'It was'} asked in ${listYears(asked)}.` : '';
  return rows.length > 1
    ? `None of these items was asked in ${year}.${when}`
    : `${rowName(rows[0]!)} was not asked in ${year}.${when}`;
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
  // A tracked grid's series are already its waves. A gender split would take
  // each cut's first series, its earliest wave, and label it Men or Women
  // (review of #20).
  if (filters.compare === 'gender' && gridOf(spec.questions) && spec.comparison === 'tracked') {
    return 'This chart already draws each wave as a series, so it cannot also split by gender.';
  }
  // A chart of one line per question would take each cut's first line, so slide 45
  // split by sex drew only the concerned line, as Men and Women, while its caption
  // still named both (review of #31).
  if (filters.compare === 'gender' && questionLines(spec)) {
    return 'This chart draws one line per question, so it cannot also split by gender.';
  }
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
  // Only the waves some row was asked in: comparing slide 39's statements by
  // wave added a 2020 series of nothing but gaps (review of #20).
  return waves
    .map((w) => w.year)
    .filter((year) => !skip.has(year) && askedInView(spec, year))
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
function merge(
  built: ViewModel[], labels: string[], filters: Filters, ranked = false, everyone: ViewModel | null = null,
): ViewModel {
  const first = built[0]!;

  const others = built.slice(1).map((model) => new Set(model.categories));
  const kept = first.categories.filter((name) => others.every((set) => set.has(name)));
  const dropped = first.categories.length - kept.length;

  // A ranked list keeps the first cut's order unless told otherwise, and the first
  // cut is 2020, or Men. So it ranks again here: by the latest wave when the cuts
  // are waves (Ishwar on THE-386), and by everyone's figure when they are the two
  // sexes, so the order is the question's own and not one sex's (review of #27).
  // Adding the two halves was an unweighted average, and could put the split
  // chart in another order from the same chart unsplit.
  let categories = kept;
  if (ranked && first.categoryKind === 'options') {
    const value = (model: ViewModel, name: string) => {
      const at = model.categories.indexOf(name);
      return at < 0 ? null : model.series[0]!.values[at];
    };
    const by = kept.map((name) => value(everyone ?? built[built.length - 1]!, name));
    categories = rankOrder(kept, by).map((i) => kept[i]!);
  }

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

/**
 * A chart's lines when it draws one per question (THE-398): several questions,
 * not a grid, and one "Showing % selecting …" note per question, in the same
 * order, split on " | " as the portal's tile_charts row stores them. Each line is
 * named by what its note names, as the note words it: "Very good or Good",
 * "Very concerned + Somewhat concerned". Null for any other chart, which draws as
 * before.
 */
function questionLines(spec: ChartSpec): { code: string; note: string; name: string }[] | null {
  if (spec.questions.length < 2 || gridOf(spec.questions) || !spec.showing) return null;
  const notes = spec.showing.split(' | ').map((n) => n.trim());
  if (notes.length !== spec.questions.length) return null;
  return spec.questions.map((code, i) => ({
    code,
    note: notes[i]!,
    // Only the quotes around each answer go, so an apostrophe inside one stays.
    name: notes[i]!.replace(/^Showing % selecting\s*/i, '').replace(/[‘“"]([^’”"]+)[’”"]/g, '$1').trim(),
  }));
}

/** `limit` is how many answers of a multi-select a chart draws: its top ten. */
function single(spec: ChartSpec, theme: Theme, filters: Filters, limit = 10): ViewModel {
  // A grid's chart lists one child per row; it is drawn from the grid itself,
  // whose deck options are those rows. Reading the first child instead drew one
  // organisation's answers where the slide plots six organisations.
  const code = gridOf(spec.questions) ?? spec.questions[0];
  const q = question(code ?? '');
  const text = q?.text ?? spec.title;
  const options = optionsFor(code ?? spec.title, text, spec.showing);
  const caveats = (spec.caveat ?? '').split('|').map((c) => c.trim()).filter(Boolean);
  const scope = filters.countries.length > 0 ? filters.countries : ['Africa'];
  // The questions are in the key, or two rows of one grid opened on their own in
  // the explorer, where every chart is order 1 of its theme, drew the same
  // figures (review of #20).
  const seed = key([theme.slug, spec.order, spec.questions.join('+'), filters.wave, filters.gender,
    scope.join('+')]);

  const common = {
    title: spec.title,
    showing: spec.showing,
    caveats,
    optionsInvented: options.illustrative,
    roles: options.roles,
    base: base(seed),
    question: q,
    // A single cut: one series, and no comparison. merge() overrides these when
    // several cuts are stacked together.
    seriesKind: 'single' as SeriesKind,
    compare: 'none' as CompareBy,
    compareNote: null,
    notAsked: null,
  };

  // One wave that the chart's rows were not asked in: no figure, and a sentence
  // saying so in place of the chart. Slide 39's statements at 2020 drew six
  // "Not asked" rows, no chips, and "ranging from — to —"; Germany at 2022 drew
  // a bar per country and "46% combined" (review of #20).
  if (spec.comparison !== 'tracked' && !askedInView(spec, filters.wave)) {
    return {
      ...common,
      categories: [],
      series: [],
      likeForLike: null,
      categoryKind: gridOf(spec.questions) ? 'rows' : 'options',
      notAsked: notAskedNote(spec, filters.wave),
    };
  }

  // A grid's chart plots its rows, and each row is a question of its own with its
  // own base (THE-315): one bar per row, each an independent share in the
  // answers the chart is "showing" (slide 13's very + somewhat positive), never
  // one distribution shared out across the rows. Tracked, one series per wave.
  // No bases: the rows are separate questions, and a combined figure across them
  // would add up answers to different questions. A pie stays a distribution, of
  // one row's answers (slide 49).
  //
  // The rows are the chart's own questions, each named as its seed names it,
  // not the grid's deck options: slides 10 and 12 are both rows of T02_Q3,
  // eight countries on one and six organisations on the other, and reading the
  // grid's options drew the countries on both. A row not asked in a wave has no
  // value there, and the chart draws a gap: slide 13's UN, IMF and G20 are 2026
  // only, and a tracked grid draws only the waves some row was asked in. Rows
  // are ranked largest first by their latest figure, as the deck ranks them
  // (review of #20).
  if (gridOf(spec.questions) && spec.type !== 'pie') {
    const children = spec.questions.map((c) => question(c)).filter((c): c is Question => !!c);
    const tracked = spec.comparison === 'tracked';
    const years = tracked
      ? waves.map((w) => w.year)
        .filter((y) => !notAsked(caveats).has(y) && children.some((c) => askedIn(c, y)))
      : [filters.wave];
    const drawn = children.map((child) => {
      const values = trend(key([seed, child.code]), years);
      return {
        name: rowName(child),
        values: years.map((year, i) => (askedIn(child, year) ? values[i]! : null)),
      };
    });
    const latest = (values: (number | null)[]): number =>
      [...values].reverse().find((v): v is number => v !== null) ?? -1;
    drawn.sort((a, b) => latest(b.values) - latest(a.values));
    return {
      ...common,
      // The row names are the seeds' own; nothing on this chart is a placeholder.
      optionsInvented: false,
      categories: drawn.map((row) => row.name),
      series: years.map((year, i) => ({
        label: tracked ? String(year) : (spec.showing ?? 'Share of respondents'),
        values: drawn.map((row) => row.values[i]!),
        bases: null,
      })),
      seriesKind: tracked ? 'waves' as SeriesKind : 'single' as SeriesKind,
      likeForLike: tracked && !caveats.some((c) => c.toLowerCase().includes('comparing only'))
        ? `Comparing only the ${likeForLike(years).length} countries surveyed in ${years.join(', ')}, `
          + 'so figures differ from the single-wave totals.'
        : null,
      categoryKind: 'rows',
    };
  }

  // A multi-select question is a ranking rather than a distribution: the deck
  // asks for "Top 10 for 2026", which is ten options in one wave, not one option
  // across four. The exception is a per-country view — a map or a country bar
  // chart plots one option across countries, and its categories must stay
  // country names or the map has nothing to colour.
  if (q?.responseType === 'multi' && spec.comparison !== 'country') {
    // The stand-ins are for a list we do not have, and `illustrative` is what says
    // so — it is also what puts the placeholder note on the chart. This used to
    // test the list's length instead, so "Key Reasons to Emigrate", whose real
    // list is four grouped reasons, was drawn as "Healthcare" and "Agriculture
    // and food" with no note at all.
    // The top ten are the largest ten, as before; on bars, Don't know, Other and
    // None of these then go to the end of them (THE-386). Slide 37's "Don't know"
    // sat ninth of ten.
    const top = multi(seed, options.illustrative ? MULTI_PLACEHOLDER : options.labels).slice(0, limit);
    const cells = rankedList(spec) ? rankOrder(top.map((c) => c.label), top.map((c) => c.pct)).map((i) => top[i]!) : top;
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
    // A grid row opened on its own draws only the waves it was asked in, as it
    // does on its grid's chart: Germany's line was 65, 65 and 71% across three
    // waves Germany was never asked in (review of #20). The waves left out are
    // named on the chart, in the deck's own phrasing.
    const every = waves.map((w) => w.year).filter((y) => !notAsked(caveats).has(y));
    const years = every.filter((y) => askedInView(spec, y));
    const unasked = every.filter((y) => !years.includes(y));
    if (years.length === 0) {
      return {
        ...common, categories: [], series: [], likeForLike: null, categoryKind: 'waves',
        notAsked: `${q ? rowName(q) : spec.title} was not asked in any wave.`,
      };
    }
    if (unasked.length > 0) caveats.push(`Not asked in ${listYears(unasked, 'or')}.`);
    const shared = likeForLike(years);
    const labels = options.labels.slice(0, 3);
    // One base per wave, shared by every series: the options are cuts of the same
    // interviews, so the denominator belongs to the year, not to the answer.
    const waveBases = years.map((year) => base(key([seed, 'n', year])));
    // The deck says the same, comparing only the countries in every wave, on most
    // of these charts; saying it twice makes both copies look like boilerplate.
    // One wave compares nothing, so there is no restriction to state.
    const restriction = years.length < 2 || caveats.some((c) => c.toLowerCase().includes('comparing only'))
      ? null
      : `Comparing only the ${shared.length} countries surveyed in ${years.join(', ')}, `
        + 'so figures differ from the single-wave totals.';

    // A chart of several questions, each with its own note, draws one line per
    // question (THE-398): slide 41's three and slide 45's two, as the deck asks
    // ("as three lines on a line chart"). Before, it drew the first question's
    // first three answers and nothing of the others. Each line is the share
    // selecting what its question's note names, illustrative like every figure
    // here, over the waves that question was asked; a wave it wasn't asked has no
    // point, and the chart says so. Lines of different questions are separate
    // people's answers to separate questions, so they are not shared out together,
    // and the colours are by position: one question's answer roles say nothing
    // about another's line. Nor do they share a base: one n per wave across the
    // lines would claim a base for a wave a question wasn't asked, so, as grid
    // rows, the lines carry none (review of #31).
    // On real data each note matches one band the portal already stores (T11_Q1
    // "Concerned", T10_Q4_CLIMATE "Satisfied", T10_Q1 "Very good or good", T10_Q2
    // "Get better", T10_Q3 "Better than my parents"). The API only passes the notes
    // through, so mapping each note to its band is still to do (THE-228).
    const perQuestion = questionLines(spec);
    if (perQuestion) {
      for (const line of perQuestion) {
        const missing = years.filter((year) => !askedIn(question(line.code), year));
        if (missing.length > 0) {
          caveats.push(`No figure for “${line.name}” in ${listYears(missing, 'or')}: its question was not asked that year.`);
        }
      }
      return {
        ...common,
        roles: null,
        categories: years.map(String),
        series: perQuestion.map((line) => {
          const values = trend(key([seed, line.code, line.note]), years);
          return {
            label: line.name,
            values: years.map((year, i) => (askedIn(question(line.code), year) ? values[i]! : null)),
            bases: null,
          };
        }),
        categoryKind: 'waves',
        seriesKind: 'options' as SeriesKind,
        likeForLike: restriction,
      };
    }
    // A stacked bar is a distribution: the segments of one bar are shares of the
    // same respondents and have to total 100. Drawing three independent trends and
    // stacking them produces bars that run past the axis — which is exactly the
    // kind of number nobody questions until it is published.
    // So is a pie: its slices are shares of the one wave it shows, and three
    // independent trends summed to 157% of it, the slices drawn as shares of that
    // while the tooltip and the table said the raw figures (review, 29 Sep).
    // So are the lines, and the bars per wave: three answers of one question are
    // shares of the same people too, and as independent trends slide 3's came to
    // 215% of everyone asked (THE-383). Each wave is shared out across every
    // answer the question has, and the first three drawn, so they total 100 less
    // whatever the others take. Sharing out only the three drawn would make them
    // total exactly 100, wrong for a question with more answers. A stacked bar and
    // a pie still share out the answers they draw, as they did.
    // The answer list we hold can itself stop short: slide 31's T07_Q3 has only
    // "Strongly agree" and "Somewhat agree", which shared out alone made the whole
    // of every wave and read as "nobody disagreed". So a list from the deck with
    // no Don't know and no "All other answers" gets one more share for the
    // answers it leaves out, never drawn (review of #24). A placeholder scale is
    // whole by design, and already says on the chart that it is invented.
    const stacks = spec.type === 'stacked' || spec.type === 'pie';
    const answers = stacks ? labels : options.labels;
    const whole = stacks || options.illustrative || answers.some((label) => THE_REST.test(label));
    const rest = whole ? [] : ['All other answers'];
    const shares = [...answers, ...rest].map((label) => ({
      label, values: trend(key([seed, label]), years), bases: waveBases,
    }));
    normalise(shares, years.length);
    const series = shares.slice(0, labels.length);
    return {
      ...common,
      categories: years.map(String),
      series,
      base: sum(waveBases),
      categoryKind: 'waves',
      // One line per answer option, so that is what the series are.
      seriesKind: 'options' as SeriesKind,
      likeForLike: restriction,
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

  // A single distribution across the response options. A list drawn as bars ranks
  // largest first; a scale keeps its own order (THE-386).
  const drawn = q?.responseType === 'multi'
    ? multi(seed, options.labels).slice(0, limit)
    : distribution(seed, options.labels);
  const cells = rankedList(spec) ? rankOrder(drawn.map((c) => c.label), drawn.map((c) => c.pct)).map((i) => drawn[i]!) : drawn;
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
    // A row not asked in this wave has no figure to read.
    value: series?.values[i] ?? undefined,
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

/**
 * An answer that takes in everyone the others leave: a Don't know, on its own or
 * joined to another answer ("Not confident / DK"), or the "All other answers"
 * `optionsFor` adds to a quoted list.
 */
const THE_REST = /don['’]?t know|\bdk\b|all other answers/i;

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
