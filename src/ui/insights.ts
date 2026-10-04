// The insight chips above each chart.
//
// This file is where the first rule of the project either holds or quietly
// fails. The approved prototype's "Average 62% across 16 countries" chip is
// computed as `rows.reduce((t, r) => t + r.a, 0) / rows.length` — the mean of the
// percentages it just drew. That weights a country of 300 interviews the same as
// one of 1,100, and it is the kind of figure nobody questions until it disagrees
// with something the Foundation has already published. Its compare branch does
// the same thing twice and subtracts the results to claim a gap.
//
// Every combined figure here goes through `combine`, which takes a numerator and
// a denominator per part and cannot be handed a percentage. Where the parts are
// not independent samples — the answer options of one question are cuts of the
// same interviews — `partsFor` returns null and the chip is not offered at all.
//
// The other thing this file does is take the built ViewModel and nothing else.
// The prototype's line branch rebuilds its own series from `ct*100+cq`, the same
// seed arithmetic used inside the chart function, so the chips and the chart are
// two independent computations of one thing and are free to drift apart. There
// is no seed in scope here, so that cannot happen.
import { combine } from '../aggregate';
import { partsFor, rows, type ViewModel } from '../model';
import { fmtPct, fmtPts, roundHalfAway } from './format';

export type InsightKind = 'high' | 'combined' | 'range' | 'shift' | 'refused';

export interface Insight {
  kind: InsightKind;
  label: string;
  sub: string;
  /** Down-trends are drawn in the negative colour rather than the positive one. */
  down?: boolean;
}

/** How far apart two figures must be before the difference is worth a chip. */
const RANGE_FLOOR = 10;
const SHIFT_FLOOR = 2;

export function insights(model: ViewModel): Insight[] {
  const out: Insight[] = [];

  if (model.categoryKind === 'waves') return trend(model);

  const cells = rows(model).filter((r) => r.value !== undefined);
  if (cells.length === 0) return out;

  // Differences between measured figures. These are honest whatever the bases
  // are: the highest figure is the highest figure.
  const sorted = [...cells].sort((a, b) => b.value! - a.value!);
  const top = sorted[0]!;
  const bottom = sorted[sorted.length - 1]!;

  if (cells.length > 1) {
    out.push({ kind: 'high', label: top.label, sub: `${fmtPct(top.value!)} highest` });
  }

  out.push(combined(model, cells.length));

  const spread = Math.round((top.value! - bottom.value!) * 10) / 10;
  if (cells.length > 2 && spread >= RANGE_FLOOR) {
    out.push({ kind: 'range', label: `${roundHalfAway(spread)}pt range`, sub: `${top.label} to ${bottom.label}` });
  }

  return out;
}

/**
 * The combined figure, or a plain statement that there is not one.
 *
 * A refusal is shown rather than hidden. The client approved a row that always
 * says something, and a chip that silently disappears when the arithmetic is not
 * available reads as a page that failed to load.
 */
function combined(model: ViewModel, count: number): Insight {
  const parts = partsFor(model);
  if (!parts) {
    return {
      kind: 'refused',
      label: 'No combined figure',
      sub: 'these are answers to one question, not separate samples',
    };
  }

  const result = combine(parts);
  if (!result.ok) return { kind: 'refused', label: 'No combined figure', sub: result.message };

  const noun = count === 1 ? 'country' : 'countries';
  return {
    kind: 'combined',
    label: `${fmtPct(result.pct)} combined`,
    sub: `across ${result.parts} ${noun}, base ${result.base.toLocaleString('en-GB')}`,
  };
}

/**
 * Waves on the axis: the peak, and the distance from the first year to the last.
 *
 * Of the first line drawn. Where there are several, the chip names it: "Peak
 * 55%" beside three lines said nothing about which, and once a reader could
 * hide the first line the chips moved to the next one without a word. THE-349.
 */
function trend(model: ViewModel): Insight[] {
  const out: Insight[] = [];
  const series = model.series[0];
  if (!series || model.categories.length < 2) return out;
  const of = model.series.length > 1 ? `${series.label} · ` : '';

  const values = series.values;
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const delta = Math.round((last - first) * 10) / 10;

  if (Math.abs(delta) >= SHIFT_FLOOR) {
    out.push({
      kind: 'shift',
      label: fmtPts(delta),
      // The first year present, never "since the baseline": a question not asked
      // in 2020 starts in 2022, and the chip is read without opening anything.
      sub: `${of}${model.categories[0]} to ${model.categories[model.categories.length - 1]}`,
      down: delta < 0,
    });
  }

  const peak = values.indexOf(Math.max(...values));
  out.push({ kind: 'high', label: `Peak ${fmtPct(values[peak]!)}`, sub: `${of}${model.categories[peak]}` });

  return out;
}

export function insightRow(model: ViewModel): HTMLElement | null {
  const found = insights(model);
  if (found.length === 0) return null;

  const row = document.createElement('div');
  row.className = 'insights';
  // The figures are generated, and the chip beside the title already says so.
  // Pointing at it keeps that one statement covering these too.
  row.setAttribute('aria-label', 'Readings from the illustrative figures on this chart');

  for (const insight of found) {
    const chip = document.createElement('span');
    chip.className = `insight insight-${insight.kind}${insight.down ? ' is-down' : ''}`;
    const dot = document.createElement('span');
    dot.className = 'insight-dot';
    dot.setAttribute('aria-hidden', 'true');
    const label = document.createElement('strong');
    label.textContent = insight.label;
    const sub = document.createElement('span');
    sub.textContent = insight.sub;
    chip.append(dot, label, sub);
    row.append(chip);
  }

  return row;
}
