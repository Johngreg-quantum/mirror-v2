import { h } from '../lib/helpers/dom.js';
import { statusPill } from './primitives.js';

export function renderChallengeResultCard({ entry, result }) {
  if (!result) {
    return h('section', { className: 'ns-result-card ns-result-card--empty' }, [
      h('div', {}, [
        h('p', { className: 'ns-eyebrow', text: 'Challenge result' }),
        h('h3', { text: 'Beat the benchmark' }),
        h('p', { text: 'Record the challenge scene and submit one scored take to reveal the head-to-head comparison.' }),
      ]),
      h('div', { className: 'ns-inline-list' }, [
        statusPill(entry?.targetScoreLabel || 'No benchmark'),
        statusPill(entry?.createdLabel || 'Awaiting challenge data'),
      ]),
    ]);
  }

  const isWin = result.outcome === 'won';

  return h('section', { className: `ns-result-card ns-result-card--${isWin ? 'win' : 'loss'}` }, [
    h('div', { className: 'ns-result-card__intro' }, [
      h('p', { className: 'ns-eyebrow', text: 'Challenge result' }),
      h('h3', { text: result.title }),
      h('p', { text: isWin ? `${result.message} Send the next benchmark while the win is fresh.` : `${result.message} One cleaner take can flip it.` }),
    ]),
    h('div', { className: 'ns-score-compare' }, [
      h('div', { className: 'ns-score-compare__item ns-score-compare__item--primary' }, [
        h('span', { text: 'Your score' }),
        h('strong', { text: result.yourScore }),
      ]),
      h('div', { className: 'ns-score-compare__item' }, [
        h('span', { text: `${entry.challengerName}'s benchmark` }),
        h('strong', { text: result.opponentScore }),
      ]),
    ]),
    h('div', { className: 'ns-inline-list' }, [
      statusPill(`${result.pointsEarned} points`),
      statusPill(result.divisionName),
      statusPill(result.comparisonLabel),
      result.isDaily ? statusPill('Daily result') : null,
      result.isNewPersonalBest ? statusPill('New PB') : null,
    ]),
  ]);
}
