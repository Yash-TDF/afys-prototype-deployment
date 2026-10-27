// The African Union's regions (THE-417, as the portal's THE-217 and THE-414). PSB asked on 22 Oct
// 2026 for these, for every country in the survey, past waves included, and for the African Union
// to be credited as their source, not PSB. Each country's region is the portal's seed
// (001_countries.sql), carried into content.json by tools/build-content.mjs. The survey covers no
// country in Northern, so it is never offered, though the order keeps its place.
import { countries } from './content';

/** The African Union's order of its regions. */
export const REGION_ORDER: readonly string[] = ['Northern', 'Southern', 'Eastern', 'Western', 'Central'];

/** Where the regions come from, credited wherever they're shown. */
export const REGION_SOURCE = { name: 'African Union', url: 'https://au.int/en/member_states/countryprofiles2' } as const;

/** Regions once each, in the African Union's order; a name it doesn't list goes last, alphabetically. */
export function regionsInOrder(regions: Iterable<string>): string[] {
  const rank = (region: string): number => {
    const at = REGION_ORDER.indexOf(region);
    return at === -1 ? REGION_ORDER.length : at;
  };
  return [...new Set(regions)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * The regions the survey's countries are in, every wave's, in the African Union's order. A region's
 * countries are those whose own `region` names it: each country carries one, so there is no second
 * list to keep. A country with no region is in none of them.
 */
export const REGIONS: readonly string[] = regionsInOrder(countries.flatMap((c) => (c.region ? [c.region] : [])));

/**
 * The four regions the review link offered before PSB asked for the African Union's, by the AU region
 * each became, so a link shared with one still opens on a region rather than on every country (review
 * of #35, Yash 27 Oct). In every wave each holds the same countries surveyed as before, except 2022's
 * Angola, which the old list put in Central Africa and the AU puts in Southern. A Map, not an object:
 * a link's text is looked up in it, and an object answers to `toString` too.
 */
const FORMER = new Map([
  ['West Africa', 'Western'],
  ['East Africa', 'Eastern'],
  ['Central Africa', 'Central'],
  ['Southern Africa', 'Southern'],
]);

/** The region a link names, by its name or a former one; null for anything that isn't one. */
export function regionNamed(name: string): string | null {
  const region = FORMER.get(name) ?? name;
  return REGIONS.includes(region) ? region : null;
}
