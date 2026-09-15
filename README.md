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

**Invented:** every percentage, every base, and — for thirty of the forty-one
questions — the response options themselves. A chart drawn with invented options
says so underneath. `NEEDED_FROM_PSB.md` is that list, and it is the specific ask
to send rather than "please send the codebook".

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
| Landing page — HTML, CSS, app shell, the deck's structure | **10.6 KB** |
| Chart.js core, first time any chart is drawn | +30.2 KB |
| `chartjs-chart-geo` + `d3-geo`, only when a map is drawn | +64.0 KB |
| Africa outline, 51 countries at 110m | +11.9 KB |
| Worst case: a cold cache landing straight on a map | 124.3 KB |

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

The palette, both typefaces and the card treatment are taken from
afys.vercel.app — read off its deployed stylesheet, not guessed:

| | |
|---|---|
| Ground | `#faf8f4` |
| Heading green | `#1a3a2a` · Instrument Serif |
| Body | `#1e293b` · Plus Jakarta Sans |
| Gold | `#d4a338` |
| Cards | white, 16px radius, hairline `#ece8e0` |
| Pills | 100px radius — nav, filters, chart-type switch |
| Charts | the approved green / gold / rose triad |

That is deliberate. Round zero asks the client to approve **structure**; if it
also looked like a redesign, they would spend the review on the surface. The
deck's own tile colours are still used, but for theme identity — tags, tile
borders, the choropleth ramp — which is what they were chosen for.

We still want the prototype source from Nimit, for the parts a screenshot cannot
give: hover and transition behaviour, and the exact spacing scale.

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
9. The "Right Direction 55%" headline card is gone. 55% is the *wrong*-direction
   figure on the report's printed page 18; the right-direction figure is 37%.
   Rather than swap one invented headline for another, the summary row now carries
   only facts we can source — 28 countries, 4 waves, 12 themes, 14,000+
   respondents. **There is no generated number anywhere on the landing page**

## Layout

```
tools/build-content.mjs   seeds → src/data/content.json
tools/make-africa.mjs     world-atlas → public/africa.geo.json (Africa only, 110m)
tools/report-size.mjs     what loads, when, gzipped
tools/audit-options.ts    which questions we cannot draw honestly yet
src/content.ts            the deck, typed
src/illustrative.ts       the generated figures — deleted when the API is wired up
src/model.ts              chart spec + filters → view model (shaped like the API response)
src/charts/               Chart.js setup, the value-label plugin, the renderer
src/views/                themes · tile · explorer · methodology · filters
```

`src/model.ts` is the seam. When this becomes real, `buildViewModel` is replaced by
a call to `GET /questions/:code/data` and nothing else moves.
