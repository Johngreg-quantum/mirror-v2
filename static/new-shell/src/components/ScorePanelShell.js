import { h } from '../lib/helpers/dom.js';
import { adaptAnalyzeViewModel } from '../lib/adapters/analyze-adapter.js';
import { statusPill } from './primitives.js';

export function renderScorePanelShell({
  title = 'Score result',
  score = 89,
  scoreLabel = 'score',
  detail = 'Returned score details appear here after analyze completes.',
  analyzeStore = null,
  onCleanup,
} = {}) {
  const titleEl = h('h3', { text: title });
  const detailEl = h('p', { className: 'ns-score-panel__detail', text: detail });
  const scoreEl = h('strong', { text: score });
  const scoreLabelEl = h('span', { text: scoreLabel });
  const pillRow = h('div', { className: 'ns-inline-list ns-score-panel__pills' });
  const compareGrid = h('div', { className: 'ns-score-compare', hidden: true });
  const metricsGrid = h('dl', { className: 'ns-analyze-metrics', hidden: true });
  const translationBlock = h('section', { className: 'ns-score-panel__translation', hidden: true });
  const translationText = h('p');
  const intro = h('div', { className: 'ns-score-panel__intro' }, [
    h('p', { className: 'ns-eyebrow', text: 'Scored take' }),
    titleEl,
    detailEl,
  ]);
  const header = h('div', { className: 'ns-score-panel__header' }, [
    intro,
    h('div', { className: 'ns-score-panel__score' }, [
      scoreEl,
      scoreLabelEl,
    ]),
  ]);
  const body = h('div', { className: 'ns-score-panel__body' }, [
    compareGrid,
    metricsGrid,
  ]);

  translationBlock.append(
    h('p', { className: 'ns-eyebrow', text: 'Translation' }),
    translationText,
  );

  const root = h('section', { className: 'ns-score-panel' }, [
    header,
    pillRow,
    body,
    translationBlock,
  ]);

  function renderPills(pills = []) {
    pillRow.replaceChildren(...pills.map((pill) => statusPill(pill)));
  }

  function renderComparison(rows = []) {
    if (!rows.length) {
      compareGrid.hidden = true;
      compareGrid.replaceChildren();
      return;
    }

    compareGrid.hidden = false;
    compareGrid.replaceChildren(...rows.map((row) => h('div', { className: 'ns-score-compare__item' }, [
      h('span', { text: row.label }),
      h('strong', { className: 'ns-score-compare__value', text: row.value }),
    ])));
  }

  function renderMetrics(rows = []) {
    if (!rows.length) {
      metricsGrid.hidden = true;
      metricsGrid.replaceChildren();
      return;
    }

    metricsGrid.hidden = false;
    metricsGrid.replaceChildren(...rows.map((row) => h('div', { className: 'ns-analyze-metric' }, [
      h('dt', { text: row.label }),
      h('dd', { text: row.value }),
    ])));
  }

  function update(viewModel) {
    titleEl.textContent = viewModel.title;
    detailEl.textContent = viewModel.detail;
    scoreEl.textContent = viewModel.score;
    scoreLabelEl.textContent = viewModel.scoreLabel;
    root.style.setProperty('--ns-score-accent', viewModel.divisionColor || '');
    renderPills(viewModel.pills);
    renderComparison(viewModel.comparison);
    renderMetrics(viewModel.metrics);

    if (viewModel.translation) {
      translationBlock.hidden = false;
      translationText.textContent = viewModel.translation;
    } else {
      translationBlock.hidden = true;
      translationText.textContent = '';
    }
  }

  if (!analyzeStore) {
    update({
      title,
      detail,
      score: String(score),
      scoreLabel,
      pills: ['Awaiting take', 'Personal best', 'Points'],
      comparison: [],
      metrics: [],
      translation: '',
      divisionColor: '',
    });
    return root;
  }

  const unsubscribe = analyzeStore.subscribe((snapshot) => {
    update(adaptAnalyzeViewModel(snapshot));
  });
  onCleanup?.(() => unsubscribe());

  return root;
}
