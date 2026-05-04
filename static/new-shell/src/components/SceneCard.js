import { h } from '../lib/helpers/dom.js';
import { CTA_COPY, STATUS_COPY } from '../lib/copy/ux-copy.js';
import { buttonLink, statusPill } from './primitives.js';
import { sceneHref } from '../lib/routing/scene-routes.js';

function getSceneStateLabel(scene) {
  if (scene.locked) {
    return STATUS_COPY.locked;
  }

  if (scene.level === 1 && scene.personalBest === null) {
    return STATUS_COPY.startHere;
  }

  if (scene.personalBest === null) {
    return STATUS_COPY.unscored;
  }

  return `PB ${scene.personalBest}`;
}

function getSceneGuideText(scene) {
  if (scene.locked) {
    return `Locked in ${scene.levelName}.`;
  }

  if (scene.level === 1 && scene.personalBest === null) {
    return 'Unlocked and unscored.';
  }

  if (scene.personalBest === null) {
    return scene.levelSceneNumber === 1
      ? `First scene in ${scene.levelName}.`
      : `Unscored scene in ${scene.levelName}.`;
  }

  if (scene.levelSceneNumber < scene.levelSceneCount) {
    return 'A saved score exists for this scene.';
  }

  return 'A saved score exists for this scene.';
}

function getSceneActionLabel(scene) {
  if (scene.locked) {
    return CTA_COPY.openLockedScene;
  }

  if (scene.isDaily) {
    return CTA_COPY.openDaily;
  }

  if (scene.level === 1 && scene.personalBest === null) {
    return CTA_COPY.startScene;
  }

  if (scene.personalBest === null) {
    return CTA_COPY.openScene;
  }

  return CTA_COPY.repeatScene;
}

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
        statusPill(getSceneStateLabel(scene)),
      ]),
      h('p', { text: `${scene.film} (${scene.year})` }),
      h('p', { className: 'ns-muted', text: `Scene ${scene.levelSceneNumber} of ${scene.levelSceneCount} in ${scene.levelName}` }),
      h('blockquote', { text: scene.quote }),
      h('div', { className: 'ns-inline-list' }, [
        statusPill(scene.difficulty),
        statusPill(scene.runtime),
        statusPill(`Target ${scene.targetScore}`),
        scene.level === 1 && !scene.locked ? statusPill(STATUS_COPY.startHere) : null,
      ]),
      h('p', { className: 'ns-muted', text: getSceneGuideText(scene) }),
      buttonLink({
        href: sceneHref(scene.id, { from: entrySource }),
        text: getSceneActionLabel(scene),
        variant: scene.locked ? 'secondary' : 'primary',
      }),
    ]),
  ]);
}
