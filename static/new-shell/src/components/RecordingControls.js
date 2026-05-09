import { h } from '../lib/helpers/dom.js';

function controlButton({ text, variant = 'primary', onClick }) {
  return h('button', {
    className: `ns-button ns-button--${variant}`,
    type: 'button',
    on: { click: onClick },
    text,
  });
}

export function createRecordingControls({ runtime, canRecord }) {
  const startButton = controlButton({
    text: 'Start recording',
    onClick: () => runtime.startRecording(),
  });
  const stopRecordButton = controlButton({
    text: 'Stop recording',
    variant: 'secondary',
    onClick: () => runtime.stopRecording(),
  });
  const playButton = controlButton({
    text: 'Play take',
    variant: 'secondary',
    onClick: () => runtime.playRecording(),
  });
  const stopPlaybackButton = controlButton({
    text: 'Stop playback',
    variant: 'secondary',
    onClick: () => runtime.stopPlayback(),
  });
  const resetButton = controlButton({
    text: 'Reset take',
    variant: 'secondary',
    onClick: () => runtime.resetTake(),
  });

  function update(state) {
    const isRecording = state.status === 'recording';
    const isPlaying = state.status === 'playing';
    const hasAudio = Boolean(state.audioBlob);

    startButton.disabled = !canRecord || isRecording || isPlaying;
    stopRecordButton.disabled = !canRecord || !isRecording;
    playButton.disabled = !canRecord || !hasAudio || isRecording || isPlaying;
    stopPlaybackButton.disabled = !canRecord || !isPlaying;
    resetButton.disabled = !hasAudio && state.status !== 'error';
  }

  return {
    root: h('div', { className: 'ns-action-row' }, [
      startButton,
      stopRecordButton,
      playButton,
      stopPlaybackButton,
      resetButton,
    ]),
    update,
  };
}
