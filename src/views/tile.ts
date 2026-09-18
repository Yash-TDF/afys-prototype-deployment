// The tile detail view — the page that does not exist in the prototype the
// client has seen.
//
// Every chart on it comes from the deck: the title, the chart type, the "showing"
// line and the caveat are the client's own, carried through from the slide. The
// slide number is printed under each one so a reviewer can check it against the
// deck without asking us.
import { theme, type Theme } from '../content';
import { renderFigure, type Figure } from '../charts/render';
import { buildViewModel, DEFAULT_FILTERS, type Filters } from '../model';
import { filterBar, missing } from './filters';

export function tileView(host: HTMLElement, slug: string): () => void {
  const found = theme(slug);
  if (!found) {
    host.replaceChildren();
    const message = document.createElement('p');
    message.className = 'empty';
    message.textContent = 'No such theme.';
    host.append(message);
    return () => {};
  }

  let filters: Filters = { ...DEFAULT_FILTERS };
  let figures: Figure[] = [];
  // draw() rebuilds the page on every filter change. The arrival is for arriving:
  // replayed each time, changing the wave would fade twelve charts out and in.
  let arrived = false;

  const draw = (): void => {
    const enter = (step: number): string => (arrived ? '' : ` an${step > 0 ? ` a${Math.min(step, 12)}` : ''}`);
    for (const figure of figures) figure.destroy();
    figures = [];
    host.replaceChildren();
    host.style.setProperty('--accent', found.accent);

    const head = header(found);
    head.className += enter(0);
    const bar = filterBar(filters, (next) => { filters = next; draw(); });
    bar.className += enter(1);
    host.append(head, bar);

    const notSurveyed = missing(filters.wave);
    if (notSurveyed.length > 0) {
      const note = document.createElement('p');
      note.className = 'scope-note';
      note.textContent =
        `${filters.wave}: ${notSurveyed.length} of the survey’s countries were not asked `
        + `(${notSurveyed.slice(0, 4).map((c) => c.name).join(', ')}`
        + `${notSurveyed.length > 4 ? ', and others' : ''}). They are absent from these charts rather than zero.`;
      host.append(note);
    }

    const grid = document.createElement('div');
    grid.className = 'chart-grid';
    host.append(grid);

    found.charts.forEach((spec, i) => {
      const cell = document.createElement('div');
      cell.className = `chart-cell${enter(i + 2)}`;
      grid.append(cell);
      const model = buildViewModel(spec, found, filters);
      figures.push(renderFigure(cell, model, spec.type, found.accent));
      if (spec.slide !== null) {
        const slide = document.createElement('p');
        slide.className = 'slide-ref';
        slide.textContent = `Portal Content deck, slide ${spec.slide}`;
        cell.append(slide);
      }
    });

    const questionList = document.createElement('section');
    questionList.className = 'question-list';
    const heading = document.createElement('h2');
    heading.textContent = 'Questions in this theme';
    questionList.append(heading);
    const list = document.createElement('ul');
    for (const code of found.questions) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#/explore?q=${code}`;
      link.textContent = code;
      item.append(link);
      list.append(item);
    }
    questionList.append(list);
    host.append(questionList);
    arrived = true;
  };

  draw();
  return () => { for (const figure of figures) figure.destroy(); };
}

function header(found: Theme): HTMLElement {
  const head = document.createElement('section');
  head.className = 'tile-header';
  const crumb = document.createElement('a');
  crumb.className = 'crumb';
  crumb.href = '#/';
  crumb.textContent = '← Themes';
  const pill = document.createElement('span');
  pill.className = 'theme-pill';
  pill.textContent = `Theme ${found.order} of 12`;
  const h1 = document.createElement('h1');
  h1.textContent = found.name;
  const count = document.createElement('p');
  count.textContent = `${found.charts.length} charts from the Portal Content deck`;
  head.append(crumb, pill, h1, count);
  return head;
}
