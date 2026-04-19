import { h } from '../lib/helpers/dom.js';
import { card, statusPill } from './primitives.js';

export function renderLoadingState(label = 'Loading Mirror') {
  return card({
    title: label,
    body: 'Preparing the latest practice view.',
    className: 'ns-state-card ns-state-card--loading',
    children: [
      h('span', { className: 'ns-loading-mark', attrs: { 'aria-hidden': 'true' } }),
      statusPill('Loading'),
    ],
  });
}

export function renderEmptyState({ title = 'No data yet', body = 'New activity will appear here once it is ready.' } = {}) {
  return card({
    title,
    body,
    className: 'ns-state-card ns-state-card--empty',
    children: [statusPill('Empty')],
  });
}

export function renderErrorState(error, { title = 'Live data unavailable' } = {}) {
  const isRateLimited = Boolean(error?.rateLimited);

  return h('section', { className: 'ns-card ns-state-card ns-state-card--error' }, [
    h('p', {
      className: 'ns-eyebrow',
      text: isRateLimited ? 'Rate limited' : error?.authRequired ? 'Auth required' : 'Read-only fetch failed',
    }),
    h('h3', { text: title }),
    h('p', { text: error?.message || 'Mirror could not load this view right now.' }),
    h('div', { className: 'ns-inline-list' }, [
      statusPill(error?.status ? `Status ${error.status}` : 'Offline'),
      isRateLimited ? statusPill(`Attempts ${error.attempts || 1}`) : null,
      isRateLimited && error?.retryAfterMs ? statusPill(`Retry after ~${Math.ceil(error.retryAfterMs / 1000)}s`) : null,
    ]),
  ]);
}
