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
  /** Null unless the theme is tracked across at least two waves. */
  delta: { points: number; from: number; to: number } | null;
  spark: number[];
  activeIndex: number;
  /** Said on the card in place of a delta, so an absence is never a zero. */
  note: string | null;
}

const NOTHING: ThemeCardFigures = {
  headline: null, of: null, delta: null, spark: [], activeIndex: -1, note: null,
};

export function themeCardFigures(theme: Theme): ThemeCardFigures {
  // Tracked first: it is the only shape that carries a trend, which is what the
  // card's delta and sparkline are for.
  const tracked = theme.charts.find((c) => c.comparison === 'tracked');
  if (tracked) {
    const model = buildViewModel(tracked, theme, DEFAULT_FILTERS);
    const series = model.series[0];
    const years = model.categories.map(Number);
    const values = series?.values ?? [];
    if (series && values.length >= 2) {
      const last = values.length - 1;
      return {
        headline: values[last]!,
        of: series.label,
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
        note: `Across ${combined.parts} countries in ${latestWave}`,
      };
    }
  }

  return { ...NOTHING, note: 'Not tracked across waves' };
}
