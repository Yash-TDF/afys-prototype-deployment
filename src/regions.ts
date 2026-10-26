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
 * Each region's countries, every wave's, alphabetically, regions in the African Union's order. A
 * country with no region is left out rather than put somewhere.
 */
export const REGIONS: Readonly<Record<string, string[]>> = Object.fromEntries(
  regionsInOrder(countries.flatMap((c) => (c.region ? [c.region] : []))).map((region) => [
    region,
    countries.filter((c) => c.region === region).map((c) => c.name).sort((a, b) => a.localeCompare(b)),
  ]),
);
