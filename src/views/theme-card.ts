// The figures on a theme card.
//
// All of them come from the same `buildViewModel` the explorer uses, on the
// theme's own tracked chart and with the default filters. That is deliberate and
// it is stronger than matching seeds by hand: a card and the chart you reach by
// clicking it are the same computation, so they cannot drift apart.
//
// The approved prototype derives these from `Math.sin(idx * 17 + 3)` against a
// hardcoded array of twelve numbers, unrelated to any question, and returns three
// waves where we have four. None of that survives.
import { type Theme, latestWave } from '../content';
import { combine } from '../aggregate';
import { buildViewModel, DEFAULT_FILTERS, partsFor } from '../model';

export interface ThemeCardFigures {
  /** Null when the theme has nothing we can put a number on. */
  headline: number | null;
  /** What the percentage is of, in the deck's words where it gives them. */
  of: string | null;
  /** The same, as a sentence for the card; null falls back to `of`. */
  caption: string | null;
  /** Null unless the theme is tracked across at least two waves. */
  delta: { points: number; from: number; to: number } | null;
  spark: number[];
  activeIndex: number;
  /** Said on the card in place of a delta, so an absence is never a zero. */
  note: string | null;
}

const NOTHING: ThemeCardFigures = {
  headline: null, of: null, caption: null, delta: null, spark: [], activeIndex: -1, note: null,
};

/**
 * What each card's number measures, as a sentence, keyed by theme slug.
 *
 * The client asked for this (28 Sep): a bare "58%" said nothing. Tile 1 is in
 * their own words, "African Continent is going in the right direction"; the
 * other eleven follow it and are confirmed at sign-off.
 *
 * Each sentence describes one answer, named in `of`: the first series of the
 * theme's first tracked chart, as the answer lists stand today. A caption is
 * only true while the card reads that answer, and the answer lists move (the
 * deck's, and then the survey files': THE-347 found the first band differs on
 * six tiles once real data loads). So the sentence is used only when the card
 * really reads that answer; otherwise the answer's own label is shown, and in
 * development the mismatch is reported, so a caption can go stale but never
 * wrong.
 */
const CAPTIONS: Record<string, { of: string; caption: string }> = {
  'afro-optimism': { of: 'Right direction', caption: 'African Continent is going in the right direction' },
  'foreign-relations': { of: 'Very concerned', caption: 'Very concerned about influence from foreign powers' },
  'the-multilateral-order': { of: 'United States', caption: 'Say the United States has influence in Africa' },
  'democracy-and-governance': { of: 'Democracy is always preferable', caption: 'Say democracy is always preferable' },
  'safety-security-and-extremism': { of: 'Very concerned', caption: 'Very concerned about asylum and immigration' },
  'identity-and-emigration': { of: 'Very likely', caption: 'Very likely to emigrate' },
  'identity-and-social-justice': { of: 'Strongly disagree', caption: 'Strongly disagree that everyone is equal before the law' },
  'connected-africa': { of: 'Yes', caption: 'Have internet access' },
  'news-trust-and-the-fake-news-crisis': { of: 'At least once every day', caption: 'Encounter fake news at least once every day' },
  'government-satisfaction': { of: 'Very good or good', caption: 'Expect a very good or good quality of life' },
  'climate-change': { of: 'Not at all concerned', caption: 'Not at all concerned about climate change' },
  'environmental-realities': { of: 'Strongly agree', caption: 'Strongly agree they are satisfied with recycling' },
};

/** The caption for a theme, if the card reads the answer it was written for. */
function captionFor(theme: Theme, of: string | null): string | null {
  const expected = CAPTIONS[theme.slug];
  if (!expected || of === null) return null;
  if (expected.of === of) return expected.caption;
  if (import.meta.env.DEV) {
    console.warn(`Theme "${theme.name}": caption written for "${expected.of}" but the card reads "${of}"; showing the label instead.`);
  }
  return null;
}

export function themeCardFigures(theme: Theme): ThemeCardFigures {
  // Tracked first: it is the only shape that carries a trend, which is what the
  // card's delta and sparkline are for.
  //
  // But "tracked" in the deck means the question was asked in more than one wave,
  // not that this chart's categories are the waves. T09_Q1 is tracked and
  // multi-select, so its categories are the answer options — Instagram, Radio,
  // TikTok. Reading those as a time series gave theme 9 a headline of 23.5%, the
  // share choosing the tenth most-used news source; a delta of -29.1, that source
  // subtracted from Instagram; and "since NaN", because Number('Instagram') is
  // not a year. The card said all three on the landing page.
  //
  // So take the first tracked chart whose categories really are years, rather
  // than the first tracked chart. Theme 9 then reads its trend off "Encountering
  // fake news", which is genuinely 2020 to 2026.
  for (const chart of theme.charts.filter((c) => c.comparison === 'tracked')) {
    const model = buildViewModel(chart, theme, DEFAULT_FILTERS);
    const series = model.series[0];
    const years = model.categories.map(Number);
    const values = series?.values ?? [];
    if (!series || values.length < 2) continue;
    // Every category has to parse, not just the first: a half-numeric axis would
    // put a real year on the card and still be reading options as time.
    if (!years.every((y) => Number.isFinite(y))) continue;
    const last = values.length - 1;
    return {
      headline: values[last]!,
      of: series.label,
      caption: captionFor(theme, series.label),
      // Named years, not "since the baseline". A question not asked in 2020
      // starts at 2022, and calling that the baseline would be wrong on the
      // one card most likely to be read without opening anything.
      delta: {
        points: Math.round((values[last]! - values[0]!) * 10) / 10,
        from: years[0]!,
        to: years[last]!,
      },
      spark: values,
      activeIndex: last,
      note: null,
    };
  }

  // Otherwise a single wave across countries. Countries are separate samples, so
  // this is a combination of numerators over denominators — never a mean of the
  // per-country percentages. See aggregate.combine.
  const byCountry = theme.charts.find((c) => c.comparison === 'country');
  if (byCountry) {
    const model = buildViewModel(byCountry, theme, DEFAULT_FILTERS);
    const parts = partsFor(model, 0);
    const combined = parts ? combine(parts) : null;
    if (combined?.ok) {
      return {
        ...NOTHING,
        headline: combined.pct,
        of: model.series[0]?.label ?? null,
        caption: captionFor(theme, model.series[0]?.label ?? null),
        note: `Across ${combined.parts} countries in ${latestWave}`,
      };
    }
  }

  return { ...NOTHING, note: 'Not tracked across waves' };
}
