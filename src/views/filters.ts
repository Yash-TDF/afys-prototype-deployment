// The filter bar, shared by the tile view and the explorer.
//
// Three things here are decisions rather than markup:
//
//   - The country list is the countries surveyed in the selected wave, not all
//     twenty-eight. Offering a country that was never asked produces an empty
//     chart, and an empty chart is indistinguishable from a real finding of zero.
//   - There is no "North Africa" region. The survey does not cover it; the
//     prototype the client saw offered it, which is a promise we cannot keep.
//   - What counts as an applied filter is written down once, in FIELDS below.
//     The approved prototype lists its filters in three places — the pill row,
//     the count, and the clear-everything button — and they have already drifted
//     apart there. Adding one here touches one list.
import { countries, inWave, waves, type Country } from '../content';
import type { CompareBy, Filters } from '../model';
import { enhance, multiPicker } from './dropdown';

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

const COMPARE_LABELS: Record<CompareBy, string> = {
  none: 'Nothing',
  gender: 'Men and women',
  wave: 'Waves',
};

const ALL_COUNTRIES = 'All surveyed countries';

/**
 * The applied filters, defined once.
 *
 * The wave is deliberately not among them. It always has a value, so a pill for
 * it could never be taken off and would only add noise to a row that exists to
 * show what can be removed.
 */
interface FilterField {
  key: string;
  /** What the pill says when this is applied, or null when it is not. */
  pill: (f: Filters) => string | null;
  clear: (f: Filters) => Filters;
}

const FIELDS: FilterField[] = [
  {
    key: 'scope',
    // Region and country set the same underlying list, so they share one pill:
    // "West Africa" if that is how it was chosen, otherwise the countries.
    pill: (f) => f.region
      || (f.countries.length === 1 ? f.countries[0]!
        : f.countries.length > 1 ? `${f.countries.length} countries` : null),
    clear: (f) => ({ ...f, region: '', countries: [] }),
  },
  {
    key: 'gender',
    pill: (f) => (f.gender === 'all' ? null : GENDER_LABELS[f.gender]),
    clear: (f) => ({ ...f, gender: 'all' }),
  },
  {
    key: 'compare',
    pill: (f) => (f.compare === 'none' ? null : `Compared by ${f.compare}`),
    clear: (f) => ({ ...f, compare: 'none' }),
  },
];

/** The filters currently applied, for the pill row and for anything that counts them. */
export function activeFilters(current: Filters): { key: string; label: string; clear: () => Filters }[] {
  return FIELDS
    .map((field) => ({ key: field.key, label: field.pill(current), clear: () => field.clear(current) }))
    .filter((entry): entry is { key: string; label: string; clear: () => Filters } => entry.label !== null);
}

/** Everything off, in one step. */
export const clearAll = (current: Filters): Filters =>
  FIELDS.reduce((acc, field) => field.clear(acc), current);

export function filterBar(
  current: Filters,
  onChange: (next: Filters) => void,
  options: FilterOptions = {},
): HTMLElement {
  const bar = document.createElement('form');
  bar.className = filtersOpen ? 'filters is-open' : 'filters';
  bar.id = 'filter-bar';
  bar.addEventListener('submit', (e) => e.preventDefault());

  const applied = activeFilters(current);
  const summary = [
    ...(options.showWave !== false ? [String(current.wave)] : []),
    ...(applied.length > 0 ? applied.map((entry) => entry.label) : [ALL_COUNTRIES]),
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
      (value) => onChange({ ...current, wave: Number(value), ...rescope(current, Number(value)) }),
    ));
  }

  const surveyed = inWave(current.wave);
  const regionOptions = Object.keys(REGIONS)
    .filter((region) => surveyed.some((c) => REGIONS[region]!.includes(c.name)))
    .map((region) => ({ value: region, label: region }));

  bar.append(select(
    'Region',
    [{ value: '', label: ALL_COUNTRIES }, ...regionOptions],
    current.region,
    (value) => {
      const names = value ? surveyed.filter((c) => REGIONS[value]!.includes(c.name)).map((c) => c.name) : [];
      onChange({ ...current, countries: names, region: value });
    },
  ));

  bar.append(multiField(
    'Country',
    surveyed.map((c) => c.name),
    current.countries,
    // Choosing countries by hand drops the region: the two set the same list, and
    // a pill still claiming "West Africa" over a hand-picked selection would be
    // describing something that is no longer true.
    (names) => onChange({ ...current, countries: names, region: '' }),
  ));

  // Disabled while gender is the thing being compared. The model forces gender
  // back to 'all' in that mode — a split whose seed still carried a women-only
  // scope would draw a "Men" series out of it — so a live control here would take
  // a value and silently drop it.
  const splittingByGender = current.compare === 'gender';
  bar.append(select(
    'Gender',
    (Object.keys(GENDER_LABELS) as Filters['gender'][]).map((value) => ({ value, label: GENDER_LABELS[value] })),
    splittingByGender ? 'all' : current.gender,
    (value) => onChange({ ...current, gender: value as Filters['gender'] }),
    '',
    { disabled: splittingByGender, hint: 'Split into Men and Women instead' },
  ));

  bar.append(select(
    'Compare by',
    (Object.keys(COMPARE_LABELS) as CompareBy[]).map((value) => ({ value, label: COMPARE_LABELS[value] })),
    current.compare,
    (value) => onChange({ ...current, compare: value as CompareBy }),
  ));

  bar.append(tags(current, onChange));

  return bar;
}

/**
 * What the country selection becomes when the wave changes.
 *
 * It used to be emptied. A selection is worth keeping where it still holds: a
 * region is recomputed against the countries the new wave actually covers, and a
 * hand-picked list keeps whichever of its countries were surveyed. What cannot
 * survive is a country that was not asked in the new wave — that is the empty
 * chart this file exists to prevent.
 */
function rescope(current: Filters, wave: number): Pick<Filters, 'countries' | 'region'> {
  const surveyed = inWave(wave);
  if (current.region) {
    const names = surveyed.filter((c) => REGIONS[current.region]!.includes(c.name)).map((c) => c.name);
    return names.length > 0
      ? { countries: names, region: current.region }
      : { countries: [], region: '' };
  }
  const available = new Set(surveyed.map((c) => c.name));
  return { countries: current.countries.filter((name) => available.has(name)), region: '' };
}

// An applied filter shows as a pill that can be taken off, which is the pattern
// the client approved.
function tags(current: Filters, onChange: (next: Filters) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'ftags';

  const applied = activeFilters(current);
  for (const entry of applied) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ftag';
    button.append(entry.label);
    const cross = document.createElement('span');
    cross.className = 'fx';
    cross.textContent = '×';
    cross.setAttribute('aria-hidden', 'true');
    button.append(cross);
    button.setAttribute('aria-label', `Remove filter: ${entry.label}`);
    button.addEventListener('click', () => onChange(entry.clear()));
    row.append(button);
  }

  if (applied.length > 1) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'ftag-clear';
    clear.textContent = 'Clear all';
    clear.addEventListener('click', () => onChange(clearAll(current)));
    row.append(clear);
  }

  // Nothing applied is not an empty row with a gap above it.
  row.hidden = row.children.length === 0;
  return row;
}

function select(
  label: string,
  options: { value: string; label: string }[],
  value: string,
  onChange: (value: string) => void,
  searchFor = '',
  state: { disabled?: boolean; hint?: string } = {},
): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const text = document.createElement('span');
  text.textContent = label;
  const el = document.createElement('select');
  if (state.disabled) {
    el.disabled = true;
    if (state.hint) el.title = state.hint;
  }
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    node.selected = option.value === value;
    el.append(node);
  }
  el.addEventListener('change', () => onChange(el.value));
  wrap.append(text, el);
  // A disabled control has no list to open, and enhance() would sit listeners on
  // something that can never fire them.
  if (!state.disabled) enhance(wrap, el, searchFor);
  return wrap;
}

function multiField(
  label: string,
  values: string[],
  selected: string[],
  onChange: (selected: string[]) => void,
): HTMLElement {
  // A div rather than a label: the trigger is a button, and a label wrapping a
  // button would give the field two accessible names and one confused click
  // target.
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const text = document.createElement('span');
  text.className = 'field-label';
  text.id = `field-${label.toLowerCase()}`;
  text.textContent = label;
  wrap.append(text);
  multiPicker(wrap, {
    label,
    values,
    selected,
    placeholder: ALL_COUNTRIES,
    searchFor: 'countries',
    onChange,
  });
  return wrap;
}

/** Countries not surveyed in this wave, for the "what you are not seeing" note. */
export function missing(wave: number): Country[] {
  return countries.filter((c) => !c.waves.includes(wave));
}
