// Illustrative figures.
//
// Round zero exists to get the shape of the portal approved before the survey
// files arrive, which means it has to show numbers. Three rules keep that from
// turning into the thing we are trying to avoid:
//
//   1. Nothing here is a survey result, and the page says so in three places —
//      the banner, a chip on every chart, and the tooltip.
//   2. The figures are deterministic. The same question, wave, country and option
//      produce the same number on every load and every machine, so a screenshot
//      taken today matches the site tomorrow and nobody chases a "change".
//   3. Where the real response options are unknown, the chart says the options are
//      illustrative too. That list is a deliverable in itself: it is exactly what
//      we still need from PSB.
//
// When the API is wired up, this file is deleted. Nothing imports from it except
// the views, and each of those calls one function.

/** cyrb53 — small, fast, well-distributed. Any stable hash would do. */
function hash(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** A stable number in [0, 1) for any key. */
const unit = (key: string): number => (hash(key) % 100000) / 100000;

export interface OptionSet {
  labels: string[];
  /** True when we invented the options because the deck does not record them. */
  illustrative: boolean;
}

const AGREEMENT = ['Strongly agree', 'Somewhat agree', 'Somewhat disagree', 'Strongly disagree'];
const CONCERN = ['Very concerned', 'Somewhat concerned', 'Not very concerned', 'Not at all concerned'];
const INFLUENCE = ['A lot of influence', 'Some influence', 'Not much influence', 'No influence at all'];
const DIRECTION = ['Right direction', 'Wrong direction', "Don't know"];

/**
 * The response options for a question, taken from the deck where the deck records
 * them and invented where it does not.
 *
 * The deck records options in two places: quoted inside a "Showing % selecting
 * ‘X’ + ‘Y’" note, and occasionally spelled out in the question text as
 * semicolon-separated statements. Everything else falls back to a scale chosen by
 * the wording, and is flagged.
 */
export function optionsFor(code: string, text: string, showing: string | null): OptionSet {
  const quoted = showing ? [...showing.matchAll(/[‘'"]([^’'"]+)[’'"]/g)].map((m) => m[1]!) : [];
  if (quoted.length >= 2) return { labels: [...quoted, 'All other answers'], illustrative: false };

  const statements = text.split('?').slice(1).join('?').split(';').map((s) => s.trim()).filter(Boolean);
  if (statements.length >= 2 && statements.every((s) => s.length > 12)) {
    return { labels: [...statements, "Don't know"], illustrative: false };
  }

  const lower = text.toLowerCase();
  if (lower.includes('right direction') || lower.includes('wrong direction')) {
    return { labels: DIRECTION, illustrative: false };
  }
  if (lower.includes('how concerned')) return { labels: CONCERN, illustrative: true };
  if (lower.includes('influence')) return { labels: INFLUENCE, illustrative: true };
  void code;
  return { labels: AGREEMENT, illustrative: true };
}

export interface Cell { label: string; pct: number }

/**
 * A distribution across options that sums to 100, stable for its key.
 *
 * Single-choice questions must sum to 100 because that is what the real ones do;
 * a prototype whose bars overflow the axis teaches the client the wrong thing
 * about the design.
 */
export function distribution(key: string, labels: string[]): Cell[] {
  const weights = labels.map((label, i) => 0.15 + unit(`${key}|${label}|${i}`));
  const total = weights.reduce((a, b) => a + b, 0);
  const cells = labels.map((label, i) => ({ label, pct: Math.round((weights[i]! / total) * 1000) / 10 }));
  const drift = Math.round((100 - cells.reduce((a, c) => a + c.pct, 0)) * 10) / 10;
  cells[0]!.pct = Math.round((cells[0]!.pct + drift) * 10) / 10;
  return cells;
}

/**
 * One headline percentage — the share choosing the options a chart is "showing".
 * Used where a chart plots a single figure per country or per wave.
 */
export function headline(key: string): number {
  return Math.round((18 + unit(key) * 64) * 10) / 10;
}

/**
 * A figure tracked across waves.
 *
 * Deliberately a slow drift rather than an independent draw per wave: a line that
 * zig-zags between 29% and 77% invites the client to react to movement that does
 * not exist, and the shape of the line is one of the things they are being asked
 * to approve.
 */
export function trend(key: string, years: number[]): number[] {
  let value = 24 + unit(key) * 48;
  return years.map((year, i) => {
    if (i > 0) value += (unit(`${key}|${year}`) - 0.45) * 13;
    value = Math.min(88, Math.max(6, value));
    return Math.round(value * 10) / 10;
  });
}

/**
 * Multi-select shares. These deliberately do not sum to 100: respondents pick
 * more than one, and the portal will show exactly this, so the client should see
 * it now rather than query it later.
 */
export function multi(key: string, labels: string[]): Cell[] {
  return labels
    .map((label) => ({ label, pct: Math.round((8 + unit(`${key}|${label}`) * 55) * 10) / 10 }))
    .sort((a, b) => b.pct - a.pct);
}

/** Unweighted base, shown so the design has somewhere to put it. */
export function base(key: string): number {
  return 250 + Math.round(unit(`base|${key}`) * 900);
}
