// New-shell copy guardrails:
// - CTA labels stay short, factual, and action-led.
// - Status labels describe visible state only.
// - Helper text names the current constraint and the next supported action.

export const CTA_COPY = Object.freeze({
  backHome: 'Back home',
  createAccount: 'Create account',
  getScore: 'Get score',
  openDaily: 'Open daily',
  openLockedScene: 'Open locked scene',
  openNextScene: 'Open next scene',
  openScene: 'Open scene',
  repeatScene: 'Repeat scene',
  signIn: 'Sign in',
  signInToSaveProgress: 'Sign in to save progress',
  scoring: 'Scoring...',
  startScene: 'Start scene',
  startPractice: 'Start practice',
  viewLevels: 'View levels',
  viewProgress: 'View progress',
});

export const SECTION_COPY = Object.freeze({
  daily: 'Daily',
  nextUp: 'Next up',
  progress: 'Progress',
  scorecard: 'Scorecard',
  sceneStatus: 'Scene status',
});

export const STATUS_COPY = Object.freeze({
  authRequired: 'Sign-in needed',
  completedToday: 'Completed today',
  dailyStatusUnavailable: 'Daily status unavailable',
  disabled: 'Not ready',
  empty: 'Empty',
  error: 'Error',
  loading: 'Loading',
  locked: 'Locked',
  noPersonalBest: 'No PB yet',
  noScoresYet: 'No scores yet',
  rateLimited: 'Rate limited',
  ready: 'Ready',
  readOnlyFetchFailed: 'Saved data unavailable',
  recording: 'Recording',
  playingTake: 'Playing take',
  runtimeError: 'Recording error',
  scored: 'Scored',
  scoring: 'Scoring',
  scoringReady: 'Scoring ready',
  signInNeeded: 'Sign-in needed',
  startHere: 'Start here',
  submitting: 'Submitting',
  takeReady: 'Take ready',
  takeRecorded: 'Take recorded',
  unscored: 'Unscored',
  unlocked: 'Unlocked',
});

export const STATE_COPY = Object.freeze({
  noScoredTakes: 'No scored takes yet',
  personalBestsAfterScores: 'Personal bests appear after saved scores.',
  progressAfterFirstScore: 'Progress updates after your first saved score.',
  recordBeforeScoring: 'Record a take before scoring.',
  readyToScore: 'Ready to score',
  readyToScoreSentence: 'Ready to score.',
  scoreDetailsAfterSubmittedTake: 'Score details appear after a submitted take.',
  scoreDetailsAfterRecordedTake: 'Score details appear after you submit a recorded take.',
  scoreDetailsShown: 'Score details are shown below.',
  scoreSaved: 'Score saved',
  scoringFailedForTake: 'Scoring failed for this take.',
  scoringUnavailable: 'Scoring unavailable',
  signInBeforeScoring: 'Sign in before scoring a take.',
  signInToRecord: 'Sign in to record',
  signInToRecordSentence: 'Sign in to record.',
  lockedForSession: 'This scene is locked for this session.',
  lockedRecordingAndScoring: 'This scene is locked for this session. Recording and scoring are disabled.',
});

export function isDailyComplete(status) {
  return status === STATUS_COPY.completedToday;
}

export function savedTakeSummary(summary = {}) {
  const { totalAttempts = 0, bestScore = '--', activeDays = 0 } = summary || {};

  if (!totalAttempts) {
    return STATE_COPY.progressAfterFirstScore;
  }

  return `${totalAttempts} saved take${totalAttempts === 1 ? '' : 's'}, best ${bestScore || '--'}, ${activeDays || 0} active day${activeDays === 1 ? '' : 's'}.`;
}

export function scoreSnapshotLabel(snapshot) {
  if (!snapshot) {
    return STATUS_COPY.disabled;
  }

  if (snapshot.status === 'idle') {
    return STATUS_COPY.ready;
  }

  if (snapshot.status === 'submitting') {
    return STATUS_COPY.submitting;
  }

  if (snapshot.status === 'success') {
    return STATUS_COPY.scored;
  }

  if (snapshot.status === 'error') {
    return snapshot.error?.authRequired ? STATUS_COPY.authRequired : STATUS_COPY.error;
  }

  if (snapshot.disabledCode === 'locked') {
    return STATUS_COPY.locked;
  }

  if (snapshot.disabledCode === 'auth-required') {
    return STATUS_COPY.authRequired;
  }

  return STATUS_COPY.disabled;
}

export function scoreSnapshotDetail(snapshot) {
  if (!snapshot) {
    return STATE_COPY.recordBeforeScoring;
  }

  if (snapshot.status === 'submitting') {
    return 'Submitting this take for scoring.';
  }

  if (snapshot.status === 'success') {
    return STATE_COPY.scoreDetailsShown;
  }

  if (snapshot.status === 'error') {
    return snapshot.error?.message || STATE_COPY.scoringFailedForTake;
  }

  if (snapshot.status === 'idle') {
    return STATE_COPY.readyToScoreSentence;
  }

  return snapshot.disabledReason || STATE_COPY.recordBeforeScoring;
}

export function scoreDisabledPill(snapshot) {
  if (!snapshot) {
    return STATUS_COPY.disabled;
  }

  if (snapshot.disabledCode === 'locked') {
    return STATUS_COPY.locked;
  }

  if (snapshot.disabledCode === 'auth-required') {
    return STATUS_COPY.authRequired;
  }

  return STATUS_COPY.disabled;
}
