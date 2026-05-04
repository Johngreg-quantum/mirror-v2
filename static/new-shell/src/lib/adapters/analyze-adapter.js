import { SECTION_COPY, STATUS_COPY, STATE_COPY, scoreDisabledPill } from '../copy/ux-copy.js';

function formatScore(value, fallback = '--') {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return String(Math.round(numericValue));
}

function formatCount(value, fallback = '0') {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return String(Math.round(numericValue));
}

function formatText(value, fallback = 'Unavailable') {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return fallback;
}

function buildResultPills(rawResult) {
  const pills = [];

  if (rawResult?.is_new_pb) {
    pills.push('New PB');
  }

  if (rawResult?.is_first_attempt) {
    pills.push('First attempt');
  }

  if (rawResult?.is_daily) {
    pills.push(rawResult.daily_already_done ? 'Daily already done' : 'Daily scored');
  }

  if (rawResult?.translation_unlocked) {
    pills.push('Translation unlocked');
  }

  if (rawResult?.division?.name) {
    pills.push(rawResult.division.name);
  }

  return pills;
}

function getScoreBand(score) {
  if (score >= 90) {
    return 'excellent';
  }

  if (score >= 80) {
    return 'strong';
  }

  if (score >= 65) {
    return 'promising';
  }

  return 'early';
}

function buildPerformanceCopy(rawResult, score) {
  const band = getScoreBand(score);

  if (band === 'excellent') {
    return rawResult.is_new_pb
      ? {
          title: 'Best take so far',
          detail: 'This is your highest saved score for the scene.',
        }
      : {
          title: 'High score',
          detail: 'This take landed in the top score band.',
        };
  }

  if (band === 'strong') {
    return rawResult.is_new_pb
      ? {
          title: 'New personal best',
          detail: 'This score replaced your previous best for the scene.',
        }
      : {
          title: 'Strong take',
          detail: 'This score is above the current baseline for this take.',
        };
  }

  if (band === 'promising') {
    return {
      title: 'Saved score',
      detail: 'This score gives you a saved point of comparison.',
    };
  }

  return {
    title: 'Baseline saved',
    detail: 'Repeat the scene if you want the next score to be directly comparable.',
  };
}

function buildNextMoveCopy(rawResult, score) {
  if (score >= 85 || rawResult.is_new_pb) {
    return {
      title: 'Open the next option',
      detail: 'The score is high enough to consider moving on, or you can repeat this scene.',
    };
  }

  if (score >= 65) {
    return {
      title: 'Repeat for comparison',
      detail: 'Another take on the same scene will be directly comparable.',
    };
  }

  return {
    title: 'Repeat this scene',
    detail: 'A second score will make the baseline easier to read.',
  };
}

function buildMomentumCopy(rawResult) {
  if (rawResult.is_new_pb) {
    return {
      title: 'Personal best updated',
      detail: 'Progress and scene status can now show the new saved best.',
    };
  }

  if (rawResult.is_daily && !rawResult.daily_already_done) {
    return {
      title: 'Daily saved',
      detail: 'Daily status, points, and streak data can reflect this score.',
    };
  }

  if (Number(rawResult.points_earned || 0) > 0) {
    return {
      title: `${formatCount(rawResult.points_earned)} points earned`,
      detail: 'Points update from the saved scoring result.',
    };
  }

  return {
    title: STATE_COPY.scoreSaved,
    detail: 'The saved result is available for progress and history views.',
  };
}

export function adaptAnalyzeResult(rawResult) {
  if (!rawResult) {
    return null;
  }

  const score = Number(rawResult.sync_score || 0);
  const performance = buildPerformanceCopy(rawResult, score);
  const nextMove = buildNextMoveCopy(rawResult, score);
  const momentum = buildMomentumCopy(rawResult);
  const metrics = [
    { label: 'Points earned', value: formatCount(rawResult.points_earned) },
    { label: 'Total points', value: formatCount(rawResult.total_points) },
    { label: 'Division', value: formatText(rawResult.division?.name, 'Unranked') },
    { label: 'Streak', value: formatCount(rawResult.streak) },
    {
      label: 'Previous best',
      value: rawResult.prev_best === null || rawResult.prev_best === undefined
        ? 'None'
        : formatScore(rawResult.prev_best),
    },
  ];

  if (rawResult.is_daily) {
    metrics.push(
      { label: 'Daily bonus', value: formatCount(rawResult.daily_bonus) },
      { label: 'Daily status', value: rawResult.daily_already_done ? 'Already completed today' : 'First completion today' },
    );
  }

  return {
    title: performance.title,
    detail: performance.detail,
    score: formatScore(rawResult.sync_score),
    scoreLabel: 'sync score',
    pills: buildResultPills(rawResult),
    insights: [
      { label: 'Result', value: performance.title, detail: performance.detail, emphasis: 'primary' },
      { label: SECTION_COPY.nextUp, value: nextMove.title, detail: nextMove.detail },
      { label: 'Saved state', value: momentum.title, detail: momentum.detail },
    ],
    comparison: [
      { label: 'Heard', value: formatText(rawResult.transcription, 'No transcription returned.') },
      { label: 'Target line', value: formatText(rawResult.expected, 'No expected quote returned.') },
    ],
    metrics,
    translation: rawResult.translation_unlocked && rawResult.translation
      ? formatText(rawResult.translation)
      : '',
    divisionColor: rawResult.division?.color || '',
  };
}

export function adaptAnalyzeViewModel(snapshot) {
  if (!snapshot) {
    return {
      title: STATE_COPY.scoringUnavailable,
      detail: STATE_COPY.recordBeforeScoring,
      score: '--',
      scoreLabel: 'not ready',
      pills: [STATUS_COPY.disabled],
      insights: [],
      comparison: [],
      metrics: [],
      translation: '',
      divisionColor: '',
    };
  }

  if (snapshot.status === 'success' && snapshot.result) {
    return adaptAnalyzeResult(snapshot.result);
  }

  if (snapshot.status === 'submitting') {
    return {
      title: 'Submitting take',
      detail: 'Uploading the current local take for scoring.',
      score: '--',
      scoreLabel: 'submitting',
      pills: [STATUS_COPY.submitting, STATUS_COPY.scoring],
      insights: [],
      comparison: [],
      metrics: [],
      translation: '',
      divisionColor: '',
    };
  }

  if (snapshot.status === 'error') {
    return {
      title: 'Scoring failed',
      detail: snapshot.error?.message || 'The scoring request failed.',
      score: '--',
      scoreLabel: 'request failed',
      pills: [snapshot.error?.authRequired ? STATUS_COPY.authRequired : 'Retry available'],
      insights: [],
      comparison: [],
      metrics: [],
      translation: '',
      divisionColor: '',
    };
  }

  if (snapshot.status === 'idle') {
    return {
      title: STATE_COPY.readyToScore,
      detail: 'The current local take is ready for scoring.',
      score: '--',
      scoreLabel: 'ready',
      pills: [STATUS_COPY.takeReady, STATUS_COPY.scoringReady],
      insights: [],
      comparison: [],
      metrics: [],
      translation: '',
      divisionColor: '',
    };
  }

  return {
    title: STATE_COPY.scoringUnavailable,
    detail: snapshot.disabledReason || STATE_COPY.recordBeforeScoring,
    score: '--',
    scoreLabel: snapshot.disabledCode === 'auth-required' ? 'auth required' : 'not ready',
    pills: [scoreDisabledPill(snapshot)],
    insights: [],
    comparison: [],
    metrics: [],
    translation: '',
    divisionColor: '',
  };
}
