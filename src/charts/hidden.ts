// Hiding answers: display only, never a recomputation. THE-349.
//
// The client asked to choose which answer choices the explorer shows. The rule
// that makes that safe is that a hidden answer is taken off the screen and
// nothing else changes: the answers left keep their share of everyone who
// answered, as "Don't know" does when a chart leaves it out. Rebased to total
// 100% without the hidden ones, they would be figures the Foundation never
// published, and nothing on the chart would say so.
//
// So this file never touches a value. It takes the view model as built and
// leaves out what is hidden; every number it hands on is one it was given.
import type { ViewModel } from '../model';

/**
 * The answers a reader can hide on this chart, in the order it draws them.
 *
 * The answers are the categories of a distribution, or the series of a
 * question tracked over the waves (one line per answer). A chart across
 * countries plots one answer per country, so there is nothing to choose
 * between, and it returns none.
 */
export function answersOf(model: ViewModel): string[] {
  if (model.categoryKind === 'options') return model.categories;
  if (model.seriesKind === 'options') return model.series.map((s) => s.label);
  return [];
}

/**
 * The hidden answers this chart actually has, in its own order.
 *
 * Hiding every answer is not a chart, so a set that would leave nothing on
 * screen hides nothing.
 */
export function hiddenOn(model: ViewModel, hidden: readonly string[]): string[] {
  const answers = answersOf(model);
  const chosen = answers.filter((answer) => hidden.includes(answer));
  return chosen.length === answers.length ? [] : chosen;
}

/**
 * The hidden set after a click on one answer, or null when that click would
 * hide the last answer left: that is no chart, and showing everything instead
 * is not what a click on one answer asked for.
 */
export function toggled(model: ViewModel, hidden: readonly string[], answer: string): string[] | null {
  const next = hidden.includes(answer) ? hidden.filter((a) => a !== answer) : [...hidden, answer];
  return next.length >= answersOf(model).length ? null : next;
}

/** What a refused click says. */
export const LAST_ANSWER = 'At least one answer stays on the chart';

/** The model as drawn: hidden answers left out, every other value exactly as built. */
export function withHidden(model: ViewModel, hidden: readonly string[]): ViewModel {
  const gone = new Set(hiddenOn(model, hidden));
  if (gone.size === 0) return model;

  if (model.categoryKind === 'options') {
    const keep = model.categories.map((_, i) => i).filter((i) => !gone.has(model.categories[i]!));
    return {
      ...model,
      categories: keep.map((i) => model.categories[i]!),
      series: model.series.map((s) => ({
        ...s,
        values: keep.map((i) => s.values[i]!),
        bases: s.bases ? keep.map((i) => s.bases![i]!) : null,
      })),
    };
  }
  return { ...model, series: model.series.filter((s) => !gone.has(s.label)) };
}

/** What the chart says under it when answers are hidden, or null when none are. */
export function hiddenNote(hidden: readonly string[]): string | null {
  if (hidden.length === 0) return null;
  return `${count(hidden)} hidden: ${hidden.join(', ')}. Percentages are still of all respondents, `
    + 'so the answers shown do not add up to 100%.';
}

/**
 * The same, short enough to draw inside the canvas, so a downloaded image
 * carries it. The ticket's own wording.
 */
export function hiddenCaption(hidden: readonly string[]): string | null {
  if (hidden.length === 0) return null;
  return `${count(hidden)} hidden; percentages are of all respondents`;
}

const count = (hidden: readonly string[]): string =>
  `${hidden.length} answer${hidden.length === 1 ? '' : 's'}`;
