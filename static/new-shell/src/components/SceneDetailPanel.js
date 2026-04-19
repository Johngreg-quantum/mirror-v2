import { createRecordingControls } from './RecordingControls.js';
import { createRecordingStatus } from './RecordingStatus.js';
import { createWaveformShell } from './WaveformShell.js';
import { h } from '../lib/helpers/dom.js';
import { createAppHref } from '../lib/routing/navigation.js';
import { buttonLink, card, statusPill } from './primitives.js';

function getLockLabel({ scene, session }) {
  if (session?.status !== 'authenticated') {
    return 'Unlock state needs auth';
  }

  return scene.locked ? 'Locked' : 'Unlocked';
}

function renderPersonalizationPanel({ scene, session, progressError }) {
  if (progressError) {
    return card({
      title: 'Personalization unavailable',
      body: progressError.message || 'Progress could not load for this scene.',
      className: 'ns-state-card ns-state-card--error',
      children: [statusPill(progressError.rateLimited ? 'Rate limited' : 'Read-only fetch failed')],
    });
  }

  if (session?.status !== 'authenticated') {
    return card({
      title: 'Personalization needs auth',
      body: 'Sign in to verify unlock state, personal best, and scene progress here.',
      className: 'ns-state-card ns-state-card--auth',
      children: [
        statusPill('Auth required'),
        buttonLink({ href: createAppHref('/auth'), text: 'Sign in', variant: 'secondary' }),
      ],
    });
  }

  return card({
    title: 'Personalization',
    body: scene.locked
      ? 'This scene is locked for your current session. It remains visible here, but recording and analyze stay disabled.'
      : 'This scene is available for your current session. Personal bests update from saved scoring data.',
    className: 'ns-state-card ns-state-card--ready',
    children: [
      h('div', { className: 'ns-inline-list' }, [
        statusPill(scene.locked ? 'Locked' : 'Unlocked'),
        statusPill(`PB ${scene.personalBest ?? '--'}`),
      ]),
    ],
  });
}

function getAnalyzeStatusLabel(snapshot) {
  if (snapshot.status === 'idle') {
    return 'Ready';
  }

  if (snapshot.status === 'submitting') {
    return 'Submitting';
  }

  if (snapshot.status === 'success') {
    return 'Scored';
  }

  if (snapshot.status === 'error') {
    return snapshot.error?.authRequired ? 'Auth required' : 'Error';
  }

  if (snapshot.disabledCode === 'locked') {
    return 'Locked';
  }

  if (snapshot.disabledCode === 'auth-required') {
    return 'Auth required';
  }

  return 'Disabled';
}

function getAnalyzeDetail(snapshot) {
  if (snapshot.status === 'submitting') {
    return 'Submitting the current local take for analysis.';
  }

  if (snapshot.status === 'success') {
    return 'This take has a returned score in the score panel. Reset or record a new take to clear it.';
  }

  if (snapshot.status === 'error') {
    return snapshot.error?.message || 'Analyze failed for the current take.';
  }

  if (snapshot.status === 'idle') {
    return 'The current local take is ready for analyze submit.';
  }

  return snapshot.disabledReason || 'Record a take before analyzing.';
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
      ? 'Record, review, and reset a local take before submitting it for scoring.'
      : disabledReason,
    className: `ns-runtime-card${canRecord ? ' is-ready' : ' is-disabled'}`,
    children: [
      status.root,
      waveform.root,
      controls.root,
      h('p', {
        className: 'ns-muted',
        text: 'Audio stays in this browser until analyze submit. Reset clears the take and its current result.',
      }),
    ],
  });
}

function renderAnalyzePanel({ analyzeStore, onCleanup }) {
  const statePill = statusPill('Disabled');
  const endpointPill = statusPill('Scoring ready');
  const button = h('button', {
    className: 'ns-button',
    type: 'button',
    text: 'Analyze take',
    on: {
      click: () => analyzeStore.submit(),
    },
  });
  const detailEl = h('p', { className: 'ns-muted' });
  const authLink = buttonLink({ href: createAppHref('/auth'), text: 'Sign in', variant: 'secondary' });
  authLink.hidden = true;

  const unsubscribe = analyzeStore.subscribe((snapshot) => {
    statePill.textContent = getAnalyzeStatusLabel(snapshot);
    detailEl.textContent = getAnalyzeDetail(snapshot);
    button.textContent = snapshot.status === 'submitting' ? 'Analyzing...' : 'Analyze take';
    button.disabled = !snapshot.canSubmit;
    authLink.hidden = !(snapshot.disabledCode === 'auth-required' || snapshot.error?.authRequired);
  });

  onCleanup?.(() => {
    unsubscribe();
  });

  return card({
    title: 'Analyze take',
    body: 'Send the current take for scoring when the recording feels ready.',
    className: 'ns-analyze-card',
    children: [
      h('div', { className: 'ns-inline-list' }, [statePill, endpointPill]),
      detailEl,
      h('div', { className: 'ns-action-row' }, [button, authLink]),
    ],
  });
}

function getRuntimeDisabledReason({ scene, session, progressError }) {
  if (progressError) {
    return 'Progress could not be verified, so recording stays disabled for this scene.';
  }

  if (session?.status !== 'authenticated') {
    return 'Sign in before recording a local take.';
  }

  if (scene.locked) {
    return 'This scene is locked for your current session.';
  }

  return '';
}

export function createSceneDetailPanel({
  scene,
  session,
  progressError,
  runtime,
  analyzeStore,
  runtimeDisabledReason,
  onCleanup,
}) {
  let currentScene = scene;
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
      ? 'Sign in before recording later'
      : currentScene.locked ? 'Recording locked for now' : 'Use local runtime below';

    detailBody.replaceChildren(
      h('p', { className: 'ns-eyebrow', text: currentScene.levelName }),
      h('h2', { text: currentScene.title }),
      h('p', { className: 'ns-scene-detail__meta', text: `${currentScene.film} (${currentScene.year})` }),
      h('blockquote', { text: currentScene.quote }),
      h('div', { className: 'ns-inline-list' }, [
        statusPill(currentScene.difficulty),
        statusPill(currentScene.runtime),
        statusPill(`Target ${currentScene.targetScore}`),
        statusPill(lockLabel),
        currentScene.isDaily ? statusPill('Daily scene') : statusPill('Standard scene'),
      ]),
      h('div', { className: 'ns-inline-list' }, [
        statusPill(recordLabel),
        statusPill('Local playback below'),
        statusPill(`Analyze ${getAnalyzeStatusLabel(analyzeStore.getSnapshot()).toLowerCase()}`),
      ]),
      h('p', {
        className: 'ns-muted',
        text: 'Record locally, play back your take, submit for analysis, and review refreshed progress after scoring.',
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
      personalizationSlot,
      runtimeCard,
      analyzeCard,
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
