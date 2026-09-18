// The explorer: any question, any filters, drawn however you want it.
//
// The chart-type switch is the point of this view, and it is also the honest test
// of the library choice — the same view model has to survive being drawn as a
// bar, a line, a stack, a pie, a map and a table without special-casing.
import { questions, theme, themes, type ChartSpec, type ChartType } from '../content';
import { renderFigure, type Figure } from '../charts/render';
import { buildViewModel, DEFAULT_FILTERS, type Filters, type ViewModel } from '../model';
import { filterBar } from './filters';
import { enhance } from './dropdown';

const TYPES: { value: ChartType; label: string }[] = [
  { value: 'bar', label: 'Bars' },
  { value: 'hbar', label: 'Horizontal bars' },
  { value: 'line', label: 'Over time' },
  { value: 'stacked', label: 'Stacked' },
  { value: 'pie', label: 'Share' },
  { value: 'map', label: 'Map' },
  { value: 'table', label: 'Table' },
];

export function explorerView(host: HTMLElement, params: URLSearchParams): () => void {
  let code = params.get('q') ?? questions[0]!.code;
  let kind: ChartType = 'bar';
  let filters: Filters = { ...DEFAULT_FILTERS };
  let figure: Figure | null = null;

  const draw = (): void => {
    figure?.destroy();
    host.replaceChildren();

    const found = questions.find((q) => q.code === code) ?? questions[0]!;
    const parent = themes.find((t) => t.order === found.theme)!;
    host.style.setProperty('--accent', parent.accent);

    const head = document.createElement('section');
    head.className = 'explorer-header';
    const h1 = document.createElement('h1');
    h1.textContent = 'Explore the data';
    head.append(h1);

    host.append(head);

    const layout = document.createElement('div');
    layout.className = 'elayout';

    // The question list, down the left and sticky. Grouped by theme, because
    // forty-one questions in one flat list is a wall.
    const side = document.createElement('aside');
    side.className = 'qside';
    const sideHeading = document.createElement('h2');
    sideHeading.textContent = 'Questions';
    side.append(sideHeading);
    for (const t of themes) {
      const inTheme = questions.filter((item) => item.theme === t.order);
      if (inTheme.length === 0) continue;
      const block = document.createElement('div');
      block.className = 'qside-theme';
      const name = document.createElement('h3');
      name.textContent = t.name;
      const list = document.createElement('ul');
      for (const q of inTheme) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = q.label;
        button.setAttribute('aria-current', String(q.code === found.code));
        button.addEventListener('click', () => { code = q.code; draw(); });
        li.append(button);
        list.append(li);
      }
      block.append(name, list);
      side.append(block);
    }
    layout.append(side);

    const main = document.createElement('div');
    main.className = 'emain';

    const picker = document.createElement('label');
    picker.className = 'field field-wide epicker';
    const pickerLabel = document.createElement('span');
    pickerLabel.textContent = 'Question';
    const select = document.createElement('select');
    for (const t of themes) {
      const group = document.createElement('optgroup');
      group.label = t.name;
      for (const q of questions.filter((item) => item.theme === t.order)) {
        const option = document.createElement('option');
        option.value = q.code;
        option.textContent = `${q.code} · ${q.label}`;
        option.selected = q.code === found.code;
        group.append(option);
      }
      select.append(group);
    }
    select.addEventListener('change', () => { code = select.value; draw(); });
    picker.append(pickerLabel, select);
    enhance(picker, select, 'questions');
    main.append(picker);

    const wording = document.createElement('blockquote');
    wording.className = 'question-text';
    wording.textContent = found.text;
    main.append(wording);

    if (found.baseType === 'filtered' && found.baseText) {
      const base = document.createElement('p');
      base.className = 'base-note';
      base.textContent = `Asked only of: ${found.baseText}`;
      main.append(base);
    }

    // Kept on `map` and `line` deliberately: a map still needs a wave, and the
    // line chart ignores the wave filter rather than hiding it, which is what the
    // portal will do.
    main.append(filterBar(filters, (next) => { filters = next; draw(); }));

    const switcher = document.createElement('div');
    switcher.className = 'type-switch';
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', 'Chart type');
    for (const option of TYPES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.className = option.value === kind ? 'active' : '';
      button.setAttribute('aria-pressed', String(option.value === kind));
      button.addEventListener('click', () => { kind = option.value; draw(); });
      switcher.append(button);
    }
    main.append(switcher);

    const spec: ChartSpec = {
      theme: found.theme,
      order: 1,
      title: found.label,
      type: kind,
      questions: [found.code],
      // A map and a country bar chart are both "one value per country"; a line is
      // "one value per wave"; everything else is the distribution.
      comparison: kind === 'map' || kind === 'bar' ? 'country' : kind === 'line' ? 'tracked' : 'none',
      slide: null,
      caveat: null,
      showing: null,
    };

    const model: ViewModel = buildViewModel(spec, theme(parent.slug)!, filters);
    const holder = document.createElement('div');
    holder.className = kind === 'map' ? 'explorer-figure explorer-figure-map' : 'explorer-figure';
    main.append(holder);
    figure = renderFigure(holder, model, kind, parent.accent);

    main.append(exports(model, found.code));

    layout.append(main);
    host.append(layout);
  };

  draw();
  return () => figure?.destroy();
}

/** The download row. Wired up because "can I have this as an image" arrives on day one. */
function exports(model: ViewModel, code: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'exports';

  const csv = document.createElement('button');
  csv.type = 'button';
  csv.textContent = 'Download CSV';
  csv.addEventListener('click', () => {
    const header = ['Category', ...model.series.map((s) => s.label)].join(',');
    const lines = model.categories.map((category, i) =>
      [quote(category), ...model.series.map((s) => s.values[i] ?? '')].join(','));
    const meta = [
      `# ${model.title}`,
      '# ILLUSTRATIVE FIGURES — NOT SURVEY RESULTS',
      `# Base: ${model.base} respondents`,
      ...(model.likeForLike ? [`# ${model.likeForLike}`] : []),
    ];
    download(`${code}.csv`, [...meta, header, ...lines].join('\n'), 'text/csv');
  });

  const png = document.createElement('button');
  png.type = 'button';
  png.textContent = 'Download image';
  png.addEventListener('click', () => {
    const canvas = document.querySelector<HTMLCanvasElement>('.explorer-figure canvas');
    if (!canvas) return;
    download(`${code}.png`, null, '', canvas.toDataURL('image/png'));
  });

  row.append(csv, png);
  return row;
}

const quote = (value: string): string => (value.includes(',') ? `"${value.replace(/"/g, '""')}"` : value);

function download(name: string, body: string | null, mime: string, dataUrl?: string): void {
  const href = dataUrl ?? URL.createObjectURL(new Blob([body ?? ''], { type: mime }));
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  link.click();
  if (!dataUrl) URL.revokeObjectURL(href);
}
