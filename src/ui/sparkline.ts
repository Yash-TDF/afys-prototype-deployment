// Sparklines, built as SVG nodes rather than markup strings.
//
// The approved prototype concatenates these into innerHTML. Ours build real
// nodes: the figures are generated, but the labels beside them are the client's
// own question and theme wordings, and string concatenation is how an apostrophe
// in "Don't know" becomes broken markup.
//
// Two points is the minimum, and the guard matters. The prototype places each
// point at `i / (length - 1)`, which is a division by zero for a single value; it
// works around that at one call site by padding the array and would still break
// at the others. A question asked in only one wave is not a trend, and gets no
// line rather than a flat one that implies stability nobody measured.

const NS = 'http://www.w3.org/2000/svg';

const round = (n: number): number => Math.round(n * 10) / 10;

export interface SparkOptions {
  width: number;
  height: number;
  /** Class on the <svg>. The colours come from CSS, so a theme accent applies itself. */
  className: string;
  /** Inset, so a stroke at the extremes is not clipped by the viewBox. */
  pad?: number;
  /** A dot per point, enlarged at this index. -1 draws none. */
  activeIndex?: number;
  area?: boolean;
  /** When given the line is exposed to assistive technology; otherwise it is hidden. */
  label?: string;
  /**
   * Fixed bounds for the vertical axis, in place of the series' own min and max.
   * Lines meant to be compared with each other need the same scale: on their
   * own ranges every one fills its box, and a 15-point rise looks like a 5-point
   * fall.
   */
  domain?: [number, number];
}

export function sparkline(values: number[], opts: SparkOptions): SVGSVGElement | null {
  if (values.length < 2) return null;

  const { width: w, height: h, pad = 4, activeIndex = -1, area = true } = opts;
  const [min, max] = opts.domain ?? [Math.min(...values), Math.max(...values)];
  // A value outside a fixed domain would draw outside the box; hold it at the edge.
  const clamp = (v: number): number => (opts.domain ? Math.min(max, Math.max(min, v)) : v);
  // A flat series has no range to scale against; 1 keeps it on the centre line
  // instead of dividing by zero.
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((clamp(v) - min) / range) * (h - pad * 2);
    return [round(x), round(y)] as const;
  });
  const line = points.map(([x, y]) => `${x},${y}`).join(' ');

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', opts.className);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  if (opts.label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }

  if (area) {
    const poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('class', 'spark-area');
    poly.setAttribute('points', `${line} ${round(w - pad)},${round(h - pad)} ${pad},${round(h - pad)}`);
    svg.append(poly);
  }

  const path = document.createElementNS(NS, 'polyline');
  path.setAttribute('points', line);
  svg.append(path);

  if (activeIndex >= 0) {
    points.forEach(([x, y], i) => {
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', String(x));
      dot.setAttribute('cy', String(y));
      dot.setAttribute('r', i === activeIndex ? '3' : '1.8');
      if (i !== activeIndex) dot.setAttribute('opacity', '0.45');
      svg.append(dot);
    });
  }

  return svg;
}
