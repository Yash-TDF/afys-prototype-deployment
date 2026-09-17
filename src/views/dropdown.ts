// The filter and question lists, drawn by the page instead of by the browser.
//
// The native <select> stays the control. It holds the value, the label points at
// it, the keyboard and screen readers get the real thing, and anything that sets
// its value still works. What the browser *draws* when you press it is the
// problem: the Country list has seventeen entries and needs about 440px, more
// than is left below the filter bar, so Chrome flips the list upward over the
// label it belongs to. That list also cannot be styled, so it arrives in the
// system's type with none of the page's motion.
//
// So we stop the browser opening its own list — preventing the mousedown's
// default action is what does that — and open ours underneath the control
// instead, the way the prototype the client approved does with its own list.
//
// Long lists get a search box, because seventeen countries and sixty questions
// are more than a person should have to scroll past.

/** Below this many options a list is short enough to read at a glance. */
const SEARCH_FROM = 8;

export function enhance(field: HTMLElement, select: HTMLSelectElement, searchFor = ''): void {
  const pop = document.createElement('div');
  pop.className = 'picker-pop';
  pop.hidden = true;

  const options: HTMLButtonElement[] = [];
  const groups: HTMLElement[] = [];

  const list = document.createElement('div');
  list.className = 'picker-options';
  list.setAttribute('role', 'listbox');

  const addOption = (option: HTMLOptionElement, into: HTMLElement): void => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'picker-option';
    button.setAttribute('role', 'option');
    button.dataset.value = option.value;
    button.textContent = option.textContent;
    button.addEventListener('click', () => choose(option.value));
    options.push(button);
    into.append(button);
  };

  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement) {
      const group = document.createElement('div');
      group.className = 'picker-group';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', child.label);
      const heading = document.createElement('p');
      heading.className = 'picker-group-name';
      heading.textContent = child.label;
      group.append(heading);
      for (const option of Array.from(child.children)) {
        if (option instanceof HTMLOptionElement) addOption(option, group);
      }
      groups.push(group);
      list.append(group);
    } else if (child instanceof HTMLOptionElement) {
      addOption(child, list);
    }
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

  pop.append(list, empty);
  field.append(pop);

  function filter(): void {
    const query = (search?.value ?? '').trim().toLowerCase();
    let shown = 0;
    for (const option of options) {
      const match = !query || (option.textContent ?? '').toLowerCase().includes(query);
      option.hidden = !match;
      if (match) shown += 1;
    }
    // A theme heading with nothing left under it is a heading for nothing.
    for (const group of groups) {
      group.hidden = !group.querySelector('.picker-option:not([hidden])');
    }
    empty.hidden = shown > 0;
  }

  /** The options a person can actually see and move through right now. */
  const visible = (): HTMLButtonElement[] => options.filter((option) => !option.hidden);

  function mark(): void {
    for (const option of options) {
      option.setAttribute('aria-selected', String(option.dataset.value === select.value));
    }
  }

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

  function open(): void {
    if (!pop.hidden) return;
    mark();
    if (search) { search.value = ''; filter(); }
    pop.hidden = false;
    field.classList.add('is-open');
    select.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutside, true);
    if (search) {
      search.focus();
    } else {
      (options.find((option) => option.dataset.value === select.value) ?? options[0])?.focus();
    }
    const chosen = options.find((option) => option.dataset.value === select.value);
    chosen?.scrollIntoView({ block: 'nearest' });
  }

  function close(back = false): void {
    if (pop.hidden) return;
    pop.hidden = true;
    field.classList.remove('is-open');
    select.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    if (back) select.focus();
  }

  function onOutside(event: Event): void {
    if (!field.contains(event.target as Node)) close();
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
    if (pop.hidden) { select.focus(); open(); } else { close(); }
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

  pop.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    else if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Enter' && event.target === search) {
      event.preventDefault();
      visible()[0]?.click();
    } else if (event.key === 'Tab') {
      close();
    }
  });

  mark();
}
