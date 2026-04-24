import { h } from '../lib/helpers/dom.js';
import { buttonLink, statusPill } from './primitives.js';
import { sceneHref } from '../lib/routing/scene-routes.js';

export function renderSceneCard({ scene, entrySource = 'home' }) {
  return h('article', { className: `ns-scene-card${scene.locked ? ' is-locked' : ''}` }, [
    h('div', { className: 'ns-scene-card__media' }, [
      h('img', {
        src: scene.imageUrl,
        alt: `${scene.film} visual reference`,
      }),
      scene.isDaily ? h('span', { className: 'ns-scene-card__badge', text: 'Daily' }) : null,
    ]),
    h('div', { className: 'ns-scene-card__body' }, [
      h('div', { className: 'ns-section-heading' }, [
        h('div', {}, [
          h('p', { className: 'ns-eyebrow', text: scene.levelName }),
          h('h3', { text: scene.title }),
        ]),
        statusPill(scene.locked ? 'Locked' : `PB ${scene.personalBest ?? '--'}`),
      ]),
      h('p', { text: `${scene.film} (${scene.year})` }),
      h('blockquote', { text: scene.quote }),
      h('div', { className: 'ns-inline-list' }, [
        statusPill(scene.difficulty),
        statusPill(scene.runtime),
        statusPill(`Target ${scene.targetScore}`),
      ]),
      buttonLink({
        href: sceneHref(scene.id, { from: entrySource }),
        text: scene.locked ? 'Preview locked scene' : scene.isDaily ? 'Start daily take' : 'Record this scene',
        variant: scene.locked ? 'secondary' : 'primary',
      }),
    ]),
  ]);
}
