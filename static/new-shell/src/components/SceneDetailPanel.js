import { createRecordingControls } from './RecordingControls.js';
import { createRecordingStatus } from './RecordingStatus.js';
import { createWaveformShell } from './WaveformShell.js';
import { CTA_COPY, SECTION_COPY, STATUS_COPY, STATE_COPY, scoreSnapshotDetail, scoreSnapshotLabel } from '../lib/copy/ux-copy.js';
import { h } from '../lib/helpers/dom.js';
import { createAppHref } from '../lib/routing/navigation.js';
import { buttonLink, card, statusPill } from './primitives.js';

function getLockLabel({ scene, session }) {
  if (session?.status !== 'authenticated') {
    return STATUS_COPY.signInNeeded;
  }

  return scene.locked ? STATUS_COPY.locked : STATUS_COPY.unlocked;
}

function renderPersonalizationPanel({ scene, session, progressError }) {
  if (progressError) {
    return card({
      title: 'Scene status unavailable',
      body: progressError.message || 'Scene progress could not load.',
      className: 'ns-state-card ns-state-card--error',
      children: [statusPill(progressError.rateLimited ? STATUS_COPY.rateLimited : STATUS_COPY.readOnlyFetchFailed)],
    });
  }

  if (session?.status !== 'authenticated') {
    return card({
      title: 'Scene status needs sign-in',
      body: 'Sign in to save scores, personal bests, and unlock state.',
      className: 'ns-state-card ns-state-card--auth',
      children: [
        statusPill(STATUS_COPY.authRequired),
        buttonLink({ href: createAppHref('/auth'), text: CTA_COPY.signIn, variant: 'secondary' }),
      ],
    });
  }

  return card({
    title: SECTION_COPY.sceneStatus,
    body: scene.locked
      ? STATE_COPY.lockedRecordingAndScoring
      : 'Unlocked for this session. Saved scores can update personal bests.',
    className: 'ns-state-card ns-state-card--ready',
    children: [
      h('div', { className: 'ns-inline-list' }, [
        statusPill(scene.locked ? STATUS_COPY.locked : STATUS_COPY.unlocked),
        statusPill(scene.personalBest === null ? STATUS_COPY.noPersonalBest : `PB ${scene.personalBest}`),
      ]),
    ],
  });
}

function getAnalyzeStatusLabel(snapshot) {
  return scoreSnapshotLabel(snapshot);
}

function getAnalyzeDetail(snapshot) {
  return scoreSnapshotDetail(snapshot);
}

function renderLocalRuntimePanel({ canRecord, disabledReason, runtime, onCleanup }) {
  const controls = createRecordingControls({ runtime, canRecord });
  const status = createRecordingStatus({ disabledReason });
  const waveform = createWaveformShell();
  const unsubscribe = runtime.subscribe((state) => {
    controls.update(state);
    status.update(state);
    waveform.update(state);
  });

  onCleanup?.(() => {
    unsubscribe();
  });

  return card({
    title: 'Recording studio',
    body: canRecord
      ? 'Record, play back, or reset before scoring.'
      : disabledReason,
    className: `ns-runtime-card${canRecord ? ' is-ready' : ' is-disabled'}`,
    children: [
      status.root,
      waveform.root,
      controls.root,
      h('p', {
        className: 'ns-muted',
        text: 'Audio stays local until you submit it for scoring. Reset clears this take.',
      }),
    ],
  });
}

function renderAnalyzePanel({ analyzeStore, onCleanup }) {
  const statePill = statusPill(STATUS_COPY.disabled);
  const endpointPill = statusPill(STATUS_COPY.scoringReady);
  const button = h('button', {
    className: 'ns-button',
    type: 'button',
    text: CTA_COPY.getScore,
    on: {
      click: () => analyzeStore.submit(),
    },
  });
  const detailEl = h('p', { className: 'ns-muted' });
  const authLink = buttonLink({ href: createAppHref('/auth'), text: CTA_COPY.signIn, variant: 'secondary' });
  authLink.hidden = true;

  const root = card({
    title: 'Score take',
    body: 'Submit the current take for scoring.',
    className: 'ns-analyze-card',
    children: [
      h('div', { className: 'ns-inline-list ns-detail-pill-row' }, [statePill, endpointPill]),
      detailEl,
      h('div', { className: 'ns-action-row ns-action-row--card' }, [button, authLink]),
    ],
  });

  const unsubscribe = analyzeStore.subscribe((snapshot) => {
    statePill.textContent = getAnalyzeStatusLabel(snapshot);
    detailEl.textContent = getAnalyzeDetail(snapshot);
    button.textContent = snapshot.status === 'submitting' ? CTA_COPY.scoring : CTA_COPY.getScore;
    button.disabled = !snapshot.canSubmit;
    authLink.hidden = !(snapshot.disabledCode === 'auth-required' || snapshot.error?.authRequired);
    root.classList.toggle('is-ready', snapshot.status === 'idle' && snapshot.canSubmit);
    root.classList.toggle('is-submitting', snapshot.status === 'submitting');
    root.classList.toggle('is-scored', snapshot.status === 'success');
    root.classList.toggle('is-error', snapshot.status === 'error');
  });

  onCleanup?.(() => {
    unsubscribe();
  });

  return root;
}

function getRuntimeDisabledReason({ scene, session, progressError }) {
  if (progressError) {
    return 'Scene access could not be verified, so recording is disabled.';
  }

  if (session?.status !== 'authenticated') {
    return STATE_COPY.signInToRecordSentence;
  }

  if (scene.locked) {
    return STATE_COPY.lockedForSession;
  }

  return '';
}

export function createSceneDetailPanel({
  scene,
  journey = null,
  session,
  progressError,
  runtime,
  analyzeStore,
  runtimeDisabledReason,
  onCleanup,
}) {
  let currentScene = scene;
  let currentJourney = journey;
  let currentProgressError = progressError;
  let currentRuntimeDisabledReason = runtimeDisabledReason;
  const canRecord = !currentRuntimeDisabledReason;
  const imageEl = h('img', {
    className: 'ns-scene-detail__image',
    src: currentScene.imageUrl,
    alt: `${currentScene.film} scene reference`,
  });
  const detailBody = h('div', { className: 'ns-scene-detail__body' });
  const personalizationSlot = h('div');
  const runtimeCard = renderLocalRuntimePanel({
    canRecord,
    disabledReason: currentRuntimeDisabledReason,
    runtime,
    onCleanup,
  });
  const analyzeCard = renderAnalyzePanel({ analyzeStore, onCleanup });

  function renderDetailBody() {
    const lockLabel = getLockLabel({ scene: currentScene, session });
    const recordLabel = session?.status !== 'authenticated'
      ? STATE_COPY.signInToRecord
      : currentScene.locked ? 'Recording locked' : 'Ready to record';

    detailBody.replaceChildren(
      h('p', { className: 'ns-eyebrow', text: currentScene.levelName }),
      h('h2', { text: currentScene.title }),
      h('p', { className: 'ns-scene-detail__meta', text: `${currentScene.film} (${currentScene.year})` }),
      h('blockquote', { text: currentScene.quote }),
      h('div', { className: 'ns-inline-list ns-detail-pill-row' }, [
        statusPill(currentScene.difficulty),
        statusPill(currentScene.runtime),
        statusPill(`Target ${currentScene.targetScore}`),
        currentJourney?.label ? statusPill(currentJourney.label) : null,
        statusPill(lockLabel),
        currentScene.isDaily ? statusPill('Daily scene') : statusPill('Standard scene'),
      ]),
      h('div', { className: 'ns-inline-list ns-detail-pill-row ns-detail-pill-row--quiet' }, [
        statusPill(recordLabel),
        statusPill('Local playback'),
        statusPill(`Score ${getAnalyzeStatusLabel(analyzeStore.getSnapshot()).toLowerCase()}`),
      ]),
      h('p', {
        className: 'ns-muted ns-scene-detail__guidance',
        text: currentJourney?.nextInLevel
          ? `Current level: ${currentScene.levelName}. Next in level: ${currentJourney.nextInLevel.title}.`
          : currentJourney?.nextUnlockedScene
            ? `Score this scene, then choose between repeat and ${currentJourney.nextUnlockedScene.title}.`
            : 'Record, score, then choose the next action.',
      }),
    );
  }

  function renderPersonalization() {
    personalizationSlot.replaceChildren(
      renderPersonalizationPanel({
        scene: currentScene,
        session,
        progressError: currentProgressError,
      }),
    );
  }

  function update(nextState = {}) {
    currentScene = nextState.scene || currentScene;
    currentJourney = nextState.journey === undefined ? currentJourney : nextState.journey;
    currentProgressError = nextState.progressError === undefined ? currentProgressError : nextState.progressError;
    currentRuntimeDisabledReason = nextState.runtimeDisabledReason === undefined
      ? currentRuntimeDisabledReason
      : nextState.runtimeDisabledReason;

    imageEl.src = currentScene.imageUrl;
    imageEl.alt = `${currentScene.film} scene reference`;
    renderDetailBody();
    renderPersonalization();
  }

  const unsubscribeAnalyze = analyzeStore.subscribe(() => {
    renderDetailBody();
  });

  onCleanup?.(() => {
    unsubscribeAnalyze();
  });

  const root = h('div', { className: 'ns-scene-entry-stack' }, [
    h('section', { className: 'ns-scene-detail' }, [
      h('div', { className: 'ns-scene-detail__media' }, [imageEl]),
      detailBody,
    ]),
    h('div', { className: 'ns-grid ns-grid--three ns-scene-workflow' }, [
      runtimeCard,
      analyzeCard,
      personalizationSlot,
    ]),
  ]);

  update({
    scene: currentScene,
    progressError: currentProgressError,
    runtimeDisabledReason: currentRuntimeDisabledReason,
  });

  return {
    root,
    update,
  };
}

export { getRuntimeDisabledReason };
