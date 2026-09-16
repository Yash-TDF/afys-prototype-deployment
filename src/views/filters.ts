// The filter bar, shared by the tile view and the explorer.
//
// Two things here are decisions rather than markup:
//
//   - The country list is the countries surveyed in the selected wave, not all
//     twenty-eight. Offering a country that was never asked produces an empty
//     chart, and an empty chart is indistinguishable from a real finding of zero.
//   - There is no "North Africa" region. The survey does not cover it; the
//     prototype the client saw offered it, which is a promise we cannot keep.
import { countries, inWave, waves, type Country } from '../content';
import type { Filters } from '../model';

export const REGIONS: Record<string, string[]> = {
  'West Africa': ['Benin', 'Burkina Faso', "Côte d'Ivoire", 'Gambia', 'Ghana', 'Guinea', 'Liberia', 'Mali', 'Mauritania', 'Niger', 'Nigeria', 'Senegal', 'Sierra Leone', 'Togo'],
  'East Africa': ['Burundi', 'Djibouti', 'Eritrea', 'Ethiopia', 'Kenya', 'Rwanda', 'Somalia', 'South Sudan', 'Sudan', 'Tanzania', 'Uganda'],
  'Central Africa': ['Angola', 'Cameroon', 'Central African Republic', 'Chad', 'Congo Brazzaville', 'DRC', 'Equatorial Guinea', 'Gabon'],
  'Southern Africa': ['Botswana', 'Eswatini', 'Lesotho', 'Madagascar', 'Malawi', 'Mauritius', 'Mozambique', 'Namibia', 'South Africa', 'Zambia', 'Zimbabwe'],
};

export interface FilterOptions {
  /** Hide the wave control where a chart plots every wave anyway. */
  showWave?: boolean;
}

// On a phone the four filters stack into a bar half the screen tall, so there
// they fold behind a button that says what is applied. The bar is rebuilt after
// every change, so whether it is open lives here rather than on the element.
let filtersOpen = false;

const GENDER_LABELS: Record<Filters['gender'], string> = { all: 'All respondents', male: 'Men', female: 'Women' };

export function filterBar(
  current: Filters,
  onChange: (next: Filters) => void,
  options: FilterOptions = {},
): HTMLElement {
  const bar = document.createElement('form');
  bar.className = filtersOpen ? 'filters is-open' : 'filters';
  bar.id = 'filter-bar';
  bar.addEventListener('submit', (e) => e.preventDefault());

  const scope = current.region
    || (current.countries.length === 1 ? current.countries[0]!
      : current.countries.length > 1 ? `${current.countries.length} countries` : 'All surveyed countries');
  const summary = [
    ...(options.showWave !== false ? [String(current.wave)] : []),
    scope,
    ...(current.gender !== 'all' ? [GENDER_LABELS[current.gender]] : []),
  ].join(' · ');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'filters-toggle';
  toggle.setAttribute('aria-controls', bar.id);
  toggle.setAttribute('aria-expanded', String(filtersOpen));
  const toggleLabel = document.createElement('span');
  toggleLabel.className = 'filters-toggle-label';
  toggleLabel.textContent = 'Filters';
  const toggleSummary = document.createElement('span');
  toggleSummary.className = 'filters-toggle-summary';
  toggleSummary.textContent = summary;
  // The space keeps the button's accessible name as "Filters 2026 · …"; flex layout ignores it.
  toggle.append(toggleLabel, ' ', toggleSummary);
  toggle.addEventListener('click', () => {
    filtersOpen = !filtersOpen;
    bar.classList.toggle('is-open', filtersOpen);
    toggle.setAttribute('aria-expanded', String(filtersOpen));
  });
  bar.append(toggle);

  if (options.showWave !== false) {
    bar.append(select(
      'Wave',
      waves.map((w) => ({ value: String(w.year), label: `${w.year} · ${inWave(w.year).length} countries` })),
      String(current.wave),
      (value) => onChange({ ...current, wave: Number(value), countries: [], region: '' }),
    ));
  }

  const surveyed = inWave(current.wave);
  const regionOptions = Object.keys(REGIONS)
    .filter((region) => surveyed.some((c) => REGIONS[region]!.includes(c.name)))
    .map((region) => ({ value: region, label: region }));

  bar.append(select(
    'Region',
    [{ value: '', label: 'All surveyed countries' }, ...regionOptions],
    current.region,
    (value) => {
      const names = value ? surveyed.filter((c) => REGIONS[value]!.includes(c.name)).map((c) => c.name) : [];
      onChange({ ...current, countries: names, region: value });
    },
  ));

  bar.append(select(
    'Country',
    [{ value: '', label: 'All surveyed countries' }, ...surveyed.map((c) => ({ value: c.name, label: c.name }))],
    current.countries.length === 1 ? current.countries[0]! : '',
    (value) => onChange({ ...current, countries: value ? [value] : [], region: '' }),
  ));

  bar.append(select(
    'Gender',
    (Object.keys(GENDER_LABELS) as Filters['gender'][]).map((value) => ({ value, label: GENDER_LABELS[value] })),
    current.gender,
    (value) => onChange({ ...current, gender: value as Filters['gender'] }),
  ));

  if (current.countries.length > 1) {
    const chip = document.createElement('p');
    chip.className = 'filter-note';
    chip.textContent = `${current.countries.length} countries selected`;
    bar.append(chip);
  }

  return bar;
}

function select(
  label: string,
  options: { value: string; label: string }[],
  value: string,
  onChange: (value: string) => void,
): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const text = document.createElement('span');
  text.textContent = label;
  const el = document.createElement('select');
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    node.selected = option.value === value;
    el.append(node);
  }
  el.addEventListener('change', () => onChange(el.value));
  wrap.append(text, el);
  return wrap;
}

/** Countries not surveyed in this wave, for the "what you are not seeing" note. */
export function missing(wave: number): Country[] {
  return countries.filter((c) => !c.waves.includes(wave));
}
