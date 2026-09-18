// The filter and question lists, drawn by the page instead of by the browser.
//
// For a single choice the native <select> stays the control. It holds the value,
// the label points at it, the keyboard and screen readers get the real thing, and
// anything that sets its value still works. What the browser *draws* when you
// press it is the problem: the Country list has seventeen entries and needs about
// 440px, more than is left below the filter bar, so Chrome flips the list upward
// over the label it belongs to. That list also cannot be styled, so it arrives in
// the system's type with none of the page's motion.
//
// So we stop the browser opening its own list — preventing the mousedown's
// default action is what does that — and open ours underneath the control
// instead, the way the prototype the client approved does with its own list.
//
// For several choices there is no native control to keep, and the principle above
// does not survive contact with one. <select multiple> renders as a multi-row
// list box that does not fit a filter bar, and shows only the first selection
// where the approved design shows "Kenya +3". So multiPicker is the ARIA
// combobox pattern — a button that owns a listbox — and the two entry points
// share the popup, the search, the roving focus and the outside-click below, so
// there is one set of behaviour to get right rather than two that drift.

/** Below this many options a list is short enough to read at a glance. */
const SEARCH_FROM = 8;

interface OpenPicker { field: HTMLElement; close: () => void }

const openPickers = new Set<OpenPicker>();

// One listener for the module's lifetime, rather than one added on open and
// removed on close. A picker whose element is destroyed while it is open — by a
// redraw, or by going Back — never gets to remove its own, and the page is left
// holding a listener that points at detached nodes. Anything no longer in the
// document is dropped here instead.
document.addEventListener('pointerdown', (event) => {
  for (const picker of [...openPickers]) {
    if (!picker.field.isConnected) { openPickers.delete(picker); continue; }
    if (!picker.field.contains(event.target as Node)) picker.close();
  }
}, true);

export interface OptionSpec { value: string; label: string }
export interface GroupSpec { name: string | null; options: OptionSpec[] }

interface Popup {
  pop: HTMLDivElement;
  options: HTMLButtonElement[];
  visible: () => HTMLButtonElement[];
  resetSearch: () => void;
  move: (step: number) => void;
  focusSearchOr: (value: string) => void;
}

function buildPopup(
  groups: GroupSpec[],
  searchFor: string,
  multiple: boolean,
  onActivate: (value: string, button: HTMLButtonElement) => void,
  actions?: { selectAll: () => void; clear: () => void },
): Popup {
  const pop = document.createElement('div');
  pop.className = 'picker-pop';
  pop.hidden = true;

  const options: HTMLButtonElement[] = [];
  const groupEls: HTMLElement[] = [];

  const list = document.createElement('div');
  list.className = 'picker-options';
  list.setAttribute('role', 'listbox');
  if (multiple) list.setAttribute('aria-multiselectable', 'true');

  const addOption = (option: OptionSpec, into: HTMLElement): void => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = multiple ? 'picker-option picker-option-multi' : 'picker-option';
    button.setAttribute('role', 'option');
    button.dataset['value'] = option.value;
    if (multiple) {
      // A box drawn by us, not a checkbox input: the button already carries the
      // role, the state and the label, and a real input inside it would be a
      // second focus stop announcing the same thing twice.
      const box = document.createElement('span');
      box.className = 'picker-check';
      box.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.textContent = option.label;
      button.append(box, text);
    } else {
      button.textContent = option.label;
    }
    button.addEventListener('click', () => onActivate(option.value, button));
    options.push(button);
    into.append(button);
  };

  for (const group of groups) {
    if (group.name === null) {
      for (const option of group.options) addOption(option, list);
      continue;
    }
    const el = document.createElement('div');
    el.className = 'picker-group';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', group.name);
    const heading = document.createElement('p');
    heading.className = 'picker-group-name';
    heading.textContent = group.name;
    el.append(heading);
    for (const option of group.options) addOption(option, el);
    groupEls.push(el);
    list.append(el);
  }

  const empty = document.createElement('p');
  empty.className = 'picker-empty';
  empty.textContent = 'No matches';
  empty.hidden = true;

  let search: HTMLInputElement | null = null;
  if (options.length > SEARCH_FROM) {
    const wrap = document.createElement('div');
    wrap.className = 'picker-search';
    search = document.createElement('input');
    search.type = 'text';
    search.className = 'picker-search-input';
    search.placeholder = `Search ${searchFor || 'the list'}`;
    search.setAttribute('aria-label', `Search ${searchFor || 'the list'}`);
    search.addEventListener('input', filter);
    wrap.append(search);
    pop.append(wrap);
  }

  if (actions) {
    const row = document.createElement('div');
    row.className = 'picker-actions';
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'picker-action';
    all.textContent = 'Select all';
    all.addEventListener('click', actions.selectAll);
    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'picker-action';
    none.textContent = 'Clear';
    none.addEventListener('click', actions.clear);
    row.append(all, none);
    pop.append(row);
  }

  pop.append(list, empty);

  function filter(): void {
    const query = (search?.value ?? '').trim().toLowerCase();
    let shown = 0;
    for (const option of options) {
      const match = !query || (option.textContent ?? '').toLowerCase().includes(query);
      option.hidden = !match;
      if (match) shown += 1;
    }
    // A theme heading with nothing left under it is a heading for nothing.
    for (const group of groupEls) {
      group.hidden = !group.querySelector('.picker-option:not([hidden])');
    }
    empty.hidden = shown > 0;
  }

  const visible = (): HTMLButtonElement[] => options.filter((option) => !option.hidden);

  function move(step: number): void {
    const items = visible();
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = at === -1
      ? (step > 0 ? 0 : items.length - 1)
      : Math.min(items.length - 1, Math.max(0, at + step));
    items[next]!.focus();
    items[next]!.scrollIntoView({ block: 'nearest' });
  }

  return {
    pop,
    options,
    visible,
    resetSearch: () => { if (search) { search.value = ''; filter(); } },
    move,
    focusSearchOr: (value: string) => {
      if (search) { search.focus(); return; }
      (options.find((o) => o.dataset['value'] === value) ?? options[0])?.focus();
    },
  };
}

// ---------------------------------------------------------------------------
// One choice: the native select stays the control.
// ---------------------------------------------------------------------------

export function enhance(field: HTMLElement, select: HTMLSelectElement, searchFor = ''): void {
  const groups: GroupSpec[] = [];
  const loose: OptionSpec[] = [];

  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement) {
      groups.push({
        name: child.label,
        options: Array.from(child.children)
          .filter((o): o is HTMLOptionElement => o instanceof HTMLOptionElement)
          .map((o) => ({ value: o.value, label: o.textContent ?? '' })),
      });
    } else if (child instanceof HTMLOptionElement) {
      loose.push({ value: child.value, label: child.textContent ?? '' });
    }
  }
  if (loose.length > 0) groups.unshift({ name: null, options: loose });

  const picker = buildPopup(groups, searchFor, false, (value) => choose(value));
  field.append(picker.pop);

  const entry: OpenPicker = { field, close: () => close() };

  function mark(): void {
    for (const option of picker.options) {
      option.setAttribute('aria-selected', String(option.dataset['value'] === select.value));
    }
  }

  function open(): void {
    if (!picker.pop.hidden) return;
    mark();
    picker.resetSearch();
    picker.pop.hidden = false;
    field.classList.add('is-open');
    select.setAttribute('aria-expanded', 'true');
    openPickers.add(entry);
    picker.focusSearchOr(select.value);
    picker.options.find((o) => o.dataset['value'] === select.value)?.scrollIntoView({ block: 'nearest' });
  }

  function close(back = false): void {
    if (picker.pop.hidden) return;
    picker.pop.hidden = true;
    field.classList.remove('is-open');
    select.setAttribute('aria-expanded', 'false');
    openPickers.delete(entry);
    if (back) select.focus();
  }

  function choose(value: string): void {
    close();
    select.focus();
    if (value === select.value) return;
    select.value = value;
    // The views listen for `change`, as they did when the browser drew the list.
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  select.setAttribute('aria-expanded', 'false');

  // The browser opens its list on mousedown, so that is where it has to be stopped.
  select.addEventListener('mousedown', (event) => {
    event.preventDefault();
    if (picker.pop.hidden) { select.focus(); open(); } else { close(); }
  });

  // Closed, a select answers these keys by opening its list or silently changing
  // the value. Both now open ours instead.
  select.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    } else if (event.key === 'Escape') {
      close();
    }
  });

  picker.pop.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); picker.move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); picker.move(-1); }
    else if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      picker.visible()[0]?.click();
    } else if (event.key === 'Tab') {
      close();
    }
  });

  mark();
}

// ---------------------------------------------------------------------------
// Several choices.
// ---------------------------------------------------------------------------

export interface MultiPickerOptions {
  label: string;
  values: string[];
  selected: string[];
  /** Shown on the trigger when nothing is chosen. */
  placeholder: string;
  searchFor?: string;
  onChange: (selected: string[]) => void;
}

export function multiPicker(field: HTMLElement, options: MultiPickerOptions): HTMLButtonElement {
  const chosen = new Set(options.selected);

  // What the outside has been told so far. The selection is reported when the
  // list closes, not on every tick — see commit().
  const asKey = (values: Iterable<string>): string => [...values].sort().join(' ');
  let reported = asKey(chosen);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'picker-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const picker = buildPopup(
    [{ name: null, options: options.values.map((v) => ({ value: v, label: v })) }],
    options.searchFor ?? '',
    true,
    (value, button) => {
      if (chosen.has(value)) chosen.delete(value); else chosen.add(value);
      button.setAttribute('aria-selected', String(chosen.has(value)));
      renderTrigger();
    },
    {
      selectAll: () => {
        // Not the same function as Clear. In the approved prototype these two are
        // byte-identical and both empty the selection, so Select all does nothing.
        for (const value of options.values) chosen.add(value);
        syncMarks();
        renderTrigger();
      },
      clear: () => {
        chosen.clear();
        syncMarks();
        renderTrigger();
      },
    },
  );

  function syncMarks(): void {
    for (const option of picker.options) {
      option.setAttribute('aria-selected', String(chosen.has(option.dataset['value'] ?? '')));
    }
  }

  function renderTrigger(): void {
    trigger.replaceChildren();
    const count = chosen.size;
    if (count === 0) {
      trigger.append(options.placeholder);
    } else {
      const [first] = [...chosen];
      trigger.append(first!);
      if (count > 1) {
        const badge = document.createElement('span');
        badge.className = 'picker-count';
        badge.textContent = `+${count - 1}`;
        trigger.append(badge);
      }
    }
    const names = count === 0 ? options.placeholder : [...chosen].join(', ');
    trigger.setAttribute('aria-label', `${options.label}: ${names}`);
  }

  const entry: OpenPicker = { field, close: () => close() };

  function open(): void {
    if (!picker.pop.hidden) return;
    syncMarks();
    picker.resetSearch();
    picker.pop.hidden = false;
    field.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    openPickers.add(entry);
    picker.focusSearchOr('');
  }

  function close(back = false): void {
    if (picker.pop.hidden) return;
    picker.pop.hidden = true;
    field.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    openPickers.delete(entry);
    if (back) trigger.focus();
    commit();
  }

  /**
   * Report the selection, once, when the list closes.
   *
   * Reporting on every tick meant the caller redrew, which rebuilt the filter bar
   * and destroyed the open list along with it: picking four countries meant
   * opening the list four times, and focus was thrown back to the top of the page
   * each time. The trigger still updates live, so the list is never out of step
   * with what has been ticked — only the chart waits, and it waits once.
   *
   * Opening the list and closing it unchanged reports nothing at all.
   */
  function commit(): void {
    const next = asKey(chosen);
    if (next === reported) return;
    reported = next;
    options.onChange([...chosen]);
  }

  trigger.addEventListener('click', () => {
    if (picker.pop.hidden) open(); else close();
  });

  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    } else if (event.key === 'Escape') {
      close();
    }
  });

  picker.pop.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); picker.move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); picker.move(-1); }
    else if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      picker.visible()[0]?.click();
    } else if (event.key === 'Tab') {
      close();
    }
  });

  syncMarks();
  renderTrigger();
  field.append(trigger, picker.pop);
  return trigger;
}
