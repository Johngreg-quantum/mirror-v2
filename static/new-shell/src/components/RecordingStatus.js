import { h } from '../lib/helpers/dom.js';
import { STATUS_COPY } from '../lib/copy/ux-copy.js';
import { formatElapsedTime } from '../features/scenes/runtime/runtime-timer.js';

const STATUS_LABELS = {
  idle: STATUS_COPY.ready,
  recording: STATUS_COPY.recording,
  recorded: STATUS_COPY.takeRecorded,
  playing: STATUS_COPY.playingTake,
  error: STATUS_COPY.runtimeError,
};

function getDetail(state, disabledReason) {
  if (disabledReason) {
    return disabledReason;
  }

  if (state.status === 'recording') {
    return 'Microphone capture stays local to this scene.';
  }

  if (state.status === 'recorded') {
    return 'Local audio is ready for playback or scoring.';
  }

  if (state.status === 'playing') {
    return 'Playing the local recorded take.';
  }

  if (state.status === 'error') {
    return state.error?.message || 'The local recording session could not continue.';
  }

  return 'Start a local take when you are ready.';
}

export function createRecordingStatus({ disabledReason = '' } = {}) {
  const statusEl = h('strong', { text: STATUS_LABELS.idle });
  const timerEl = h('span', { text: formatElapsedTime(0) });
  const detailEl = h('p', { text: getDetail({ status: 'idle' }, disabledReason) });

  function update(state) {
    statusEl.textContent = STATUS_LABELS[state.status] || state.status;
    timerEl.textContent = formatElapsedTime(
      state.status === 'playing'
        ? Math.min(state.elapsedMs, state.durationMs || state.elapsedMs)
        : state.elapsedMs,
    );
    detailEl.textContent = getDetail(state, disabledReason);
  }

  return {
    root: h('div', { className: 'ns-recording-status' }, [
      h('div', {}, [
        h('span', { text: 'Take state' }),
        statusEl,
      ]),
      h('div', {}, [
        h('span', { text: 'Timer' }),
        timerEl,
      ]),
      detailEl,
    ]),
    update,
  };
}
