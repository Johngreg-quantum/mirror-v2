import { h } from '../lib/helpers/dom.js';
import { buttonLink, statusPill } from './primitives.js';
import { sceneHref } from '../lib/routing/scene-routes.js';

export function renderDailyChallengeCard({ daily }) {
  return h('section', { className: 'ns-daily-card' }, [
    h('img', {
      className: 'ns-daily-card__image',
      src: daily.scene.imageUrl,
      alt: `${daily.scene.film} scene still reference`,
    }),
    h('div', { className: 'ns-daily-card__body' }, [
      h('p', { className: 'ns-eyebrow', text: 'Daily challenge' }),
      h('h2', { text: daily.scene.title }),
      h('p', { text: `${daily.scene.film} (${daily.scene.year}) - one scored take keeps the habit alive.` }),
      h('blockquote', { text: daily.scene.quote }),
      h('div', { className: 'ns-inline-list' }, [
        statusPill(daily.status),
        statusPill(daily.resetLabel),
        statusPill(`${daily.rewardPoints} points`),
        statusPill(daily.streakBonus),
      ]),
      buttonLink({ href: sceneHref(daily.scene.id, { from: 'daily' }), text: 'Keep streak alive' }),
    ]),
  ]);
}
