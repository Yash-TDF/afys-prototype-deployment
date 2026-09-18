# AfYS round zero

The revised clickable prototype. It exists to get the **shape** of the portal
approved — the themes, the tile pages, the explorer, the methodology view — before
the production front end is built against it.

**Every figure on this site is generated.** Nothing here is a survey result. That
is said in the banner, on every chart, in every tooltip and at the top of every
CSV it exports, because the last prototype's invented numbers were mistaken for
findings once already.

This is throwaway. It is not in `afys-portal`, it shares no code with it, and none
of it ships. What survives is the decisions it settles.

## Run it

```bash
pnpm install
pnpm dev          # regenerates content, then serves on :5173
```

Other scripts:

| | |
|---|---|
| `pnpm build` | production build into `dist/` |
| `pnpm size` | build, then print what actually loads and when |
| `pnpm content` | regenerate `src/data/content.json` and `public/africa.geo.json` from the portal's seeds |
| `pnpm audit:options` | list the questions whose answer options we do not have |
| `pnpm typecheck` | `tsc --noEmit` |

`pnpm content` reads `../afys-portal/db/seeds/*.sql`, so the two directories have
to sit side by side. If the deck changes, regenerate rather than editing
`content.json` by hand.

## What is real and what is not

**Real, from the client's own material:** the twelve theme tiles, the forty-one
questions and their exact wording, the thirty-nine chart specifications with their
titles, chart types, "showing" lines and caveats, the slide each came from, the
twenty-eight countries, and which waves each country appears in.

**Invented:** every percentage and every base. The response options are real for
thirty-two of the forty-one questions, recovered from the deck's own chart data;
the remaining nine are invented and every chart drawn with them says so
underneath. `NEEDED_FROM_PSB.md` is that list, and it is the specific ask to send
rather than "please send the codebook".

The figures are deterministic: the same question, wave, country and option give
the same number on every machine and every reload, so a screenshot taken today
still matches the site tomorrow.

## What this settles

**Chart.js draws everything the deck asks for.** Bar, horizontal bar, line,
stacked, pie, table, and the choropleth through `chartjs-chart-geo`. The map was
the open risk in ADR 0018; it renders Natural Earth geometry at 110m fine.

**What it cost, measured rather than argued** (`pnpm size`):

| | gzipped |
|---|---|
| Landing page — HTML, CSS, app shell, the deck's structure | **17.4 KB** |
| The view model and the generators, first time any figure is shown | +5.1 KB |
| The question search, first time it is opened | +1.6 KB |
| The data drawer, first time it is opened | +1.4 KB |
| Chart.js core, first time any chart is drawn | +30.2 KB |
| `chartjs-chart-geo` + `d3-geo`, only when a map is drawn | +64.0 KB |
| Africa outline, 51 countries at 110m | +11.9 KB |
| Worst case: a cold cache landing straight on a map | 145.9 KB |

Everything below the first line is deferred for the same reason: the card names
and question counts are the page's content, and they should not wait on the
generators, the deck's recovered answer options, or a search nobody has asked for
yet. The theme cards' figures arrive after the grid is already readable, and
`.tstats` reserves their height so nothing moves when they land.

The styles are the exception, and worth naming: they build as one asset, so the
drawer and the search cost their CSS on every page even though their code loads
on neither. That is what took the landing page from 14.8 KB to 17.4.

The geo controller is over half of the worst case, which is why it is behind a
dynamic import and why the landing view — the one page everyone loads — ships no
charting library at all. Low bandwidth is a hard requirement, and this is the
shape that respects it. 50m geometry was measured too: 66.7 KB gzipped against
11.9 KB, for smoother coastlines nobody asked for.

**The plugin gap is small.** Value labels on bars are forty lines
(`src/charts/setup.ts`). Tooltip and legend styling is an options object.

**Accessibility is ours to build.** A canvas is invisible to a screen reader, so
every chart carries an ARIA description and a table with the same figures, and the
table is a contracted chart type anyway.

## Looks like the approved prototype on purpose

The palette and the card treatment are taken from afys.vercel.app — read off its
deployed stylesheet, not guessed:

| | |
|---|---|
| Ground | `#faf8f4` |
| Heading green | `#1a3a2a` |
| Body | `#1e293b` |
| Gold | `#d4a338` |
| Cards | white, 16px radius, hairline `#ece8e0` |
| Pills | 100px radius — nav, filters, chart-type switch |
| Charts | the approved green / gold / rose triad |

**The typeface is the one exception, and it is deliberate.** The prototype uses
Instrument Serif and Plus Jakarta Sans, which appear in neither the client's style
guide nor any of their published material — they were the pitch's own choice.
`AfricanYS_style.pdf` in the asset pack specifies Montserrat, so that is what
ships. Showing the client something off-brand invites the review to be about the
brand. The revert is two custom properties in `src/styles/tokens.css`.

Round zero asks the client to approve **structure**; if it also looked like a
redesign, they would spend the review on the surface. The deck's own tile colours
are still used, but for theme identity — tags, tile borders, the choropleth ramp —
which is what they were chosen for.

We have the prototype source, and the parts a screenshot could not give — the
hover and transition behaviour, the motion curves, the spacing — are ported from
it rather than guessed at.

## What is deliberately different from the prototype the client has seen

1. Theme tiles are the deck's twelve, not the 2024 report's chapter names
2. Tile detail pages exist, with the deck's own charts and caveats on them
3. A methodology view exists — who was asked, in which wave, on a map
4. Ranked and radar views are gone; nothing in the deck asks for them
5. "North Africa" is gone from the region filter; the survey does not cover it
6. Country lists follow the selected wave, so a country that was never asked
   cannot be selected into an empty chart
7. Cross-wave charts carry the like-for-like restriction as a footnote
8. Filtered-base questions say who was actually asked
9. Countries are chosen several at a time, with a search, Select all and Clear.
   In the approved prototype Select all and Clear are byte-identical functions
   and both empty the selection, so Select all does not work there
10. A question can be compared by gender or across waves. Where that cannot be
    done honestly the chart says why instead of drawing it: a map shows one
    figure per country, a share chart is one whole, and a chart already plotting
    every wave has nothing to compare against
11. Combined figures are never the mean of the percentages on screen. The
    prototype's "Average X% across 16 countries" weights a country of 300
    interviews the same as one of 1,100; ours sums the numerators and the
    denominators, and refuses out loud where the categories are answers to one
    question rather than separate samples
12. The sample-size badge states the base and says no margin of error is shown.
    Theirs grades every base Strong, Moderate or Low and prints a confidence
    interval — over, here, a number we generated
13. The data table sorts, from real buttons with `aria-sort`; theirs puts a click
    handler on a bare header cell that a keyboard cannot reach
14. The "Right Direction 55%" headline card is gone, and stays gone at any
    figure. 55% is the *wrong*-direction number on the report's printed page 18;
    the right-direction figure is 37%. The summary row carries only facts we can
    source — 28 countries, 4 waves, 12 themes, 14,000+ respondents — and its one
    sparkline is the real count of countries per wave.

    The theme cards *do* carry a generated headline, a trend delta and a
    sparkline, because that is the shape the client approved and round zero is
    asking them to approve a shape. Each is marked in three places: the banner
    above the page, a chip on the card, and the card's own label, which reads the
    figure out and ends "illustrative figure, not a survey result". They are
    computed by the same `buildViewModel` the explorer uses, so a card and the
    chart it leads to cannot disagree.

## Layout

```
tools/build-content.mjs   seeds → src/data/content.json
tools/make-africa.mjs     world-atlas → public/africa.geo.json (Africa only, 110m)
tools/report-size.mjs     what loads, when, gzipped
tools/audit-options.ts    which questions we cannot draw honestly yet
src/content.ts            the deck, typed
src/illustrative.ts       the generated figures — deleted when the API is wired up
src/model.ts              chart spec + filters → view model (shaped like the API response)
src/aggregate.ts          the only place percentages are combined — never averaged
src/charts/               Chart.js setup, the value-label plugin, the renderer
src/ui/                   sparkline · insights · quality · download · toast · drawer · spotlight
src/styles/               the stylesheet by section; styles.css is the import list
src/views/                themes · theme-card · tile · explorer · methodology · filters · dropdown
```

`src/model.ts` is the seam. When this becomes real, `buildViewModel` is replaced by
a call to `GET /questions/:code/data` and nothing else moves.
