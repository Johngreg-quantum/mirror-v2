import { h } from '../lib/helpers/dom.js';
import { adaptAnalyzeViewModel } from '../lib/adapters/analyze-adapter.js';
import { SECTION_COPY, STATUS_COPY, STATE_COPY } from '../lib/copy/ux-copy.js';
import { statusPill } from './primitives.js';

export function renderScorePanelShell({
  title = 'Score result',
  score = 89,
  scoreLabel = 'score',
  detail = STATE_COPY.scoreDetailsAfterSubmittedTake,
  analyzeStore = null,
  onCleanup,
} = {}) {
  const titleEl = h('h3', { text: title });
  const detailEl = h('p', { className: 'ns-score-panel__detail', text: detail });
  const scoreEl = h('strong', { text: score });
  const scoreLabelEl = h('span', { text: scoreLabel });
  const pillRow = h('div', { className: 'ns-inline-list ns-detail-pill-row ns-detail-pill-row--quiet ns-score-panel__pills' });
  const insightsGrid = h('div', { className: 'ns-score-panel__insights', hidden: true });
  const compareGrid = h('div', { className: 'ns-score-compare', hidden: true });
  const metricsGrid = h('dl', { className: 'ns-analyze-metrics', hidden: true });
  const translationBlock = h('section', { className: 'ns-score-panel__translation', hidden: true });
  const translationText = h('p');
  const intro = h('div', { className: 'ns-score-panel__intro' }, [
    h('p', { className: 'ns-eyebrow', text: SECTION_COPY.scorecard }),
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
    insightsGrid,
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

  function renderInsights(items = []) {
    if (!items.length) {
      insightsGrid.hidden = true;
      insightsGrid.replaceChildren();
      return;
    }

    insightsGrid.hidden = false;
    insightsGrid.replaceChildren(...items.map((item) => h('section', {
      className: `ns-score-insight${item.emphasis === 'primary' ? ' ns-score-insight--primary' : ''}`,
    }, [
      h('p', { className: 'ns-eyebrow', text: item.label }),
      h('h4', { text: item.value }),
      h('p', { text: item.detail }),
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

  function update(viewModel, status = '') {
    titleEl.textContent = viewModel.title;
    detailEl.textContent = viewModel.detail;
    scoreEl.textContent = viewModel.score;
    scoreLabelEl.textContent = viewModel.scoreLabel;
    root.style.setProperty('--ns-score-accent', viewModel.divisionColor || '');
    root.classList.toggle('is-scored', status === 'success');
    root.classList.toggle('is-submitting', status === 'submitting');
    root.classList.toggle('is-error', status === 'error');
    root.classList.toggle('is-ready', status === 'idle');
    renderPills(viewModel.pills);
    renderInsights(viewModel.insights);
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
      pills: ['Waiting for take', STATUS_COPY.noScoresYet],
      insights: [],
      comparison: [],
      metrics: [],
      translation: '',
      divisionColor: '',
    });
    return root;
  }

  const unsubscribe = analyzeStore.subscribe((snapshot) => {
    update(adaptAnalyzeViewModel(snapshot), snapshot.status);
  });
  onCleanup?.(() => unsubscribe());

  return root;
}
