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

export function adaptAnalyzeResult(rawResult) {
  if (!rawResult) {
    return null;
  }

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
    title: 'Analyze result',
    detail: 'Your scored take is ready.',
    score: formatScore(rawResult.sync_score),
    scoreLabel: 'sync score',
    pills: buildResultPills(rawResult),
    comparison: [
      { label: 'Transcription', value: formatText(rawResult.transcription, 'No transcription returned.') },
      { label: 'Expected', value: formatText(rawResult.expected, 'No expected quote returned.') },
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
      title: 'Analyze unavailable',
      detail: 'Record a take before analyzing.',
      score: '--',
      scoreLabel: 'not ready',
      pills: ['Disabled'],
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
      pills: ['Submitting', 'Scoring'],
      comparison: [],
      metrics: [],
      translation: '',
      divisionColor: '',
    };
  }

  if (snapshot.status === 'error') {
    return {
      title: 'Analyze failed',
      detail: snapshot.error?.message || 'The analyze request failed.',
      score: '--',
      scoreLabel: 'request failed',
      pills: [snapshot.error?.authRequired ? 'Auth required' : 'Retry available'],
      comparison: [],
      metrics: [],
      translation: '',
      divisionColor: '',
    };
  }

  if (snapshot.status === 'idle') {
    return {
      title: 'Ready to analyze',
      detail: 'The current local take is ready for scoring.',
      score: '--',
      scoreLabel: 'ready',
      pills: ['Take ready', 'Scoring ready'],
      comparison: [],
      metrics: [],
      translation: '',
      divisionColor: '',
    };
  }

  return {
    title: 'Analyze unavailable',
    detail: snapshot.disabledReason || 'Record a take before analyzing.',
    score: '--',
    scoreLabel: snapshot.disabledCode === 'auth-required' ? 'auth required' : 'not ready',
    pills: [snapshot.disabledCode === 'locked' ? 'Locked' : snapshot.disabledCode === 'auth-required' ? 'Auth required' : 'Disabled'],
    comparison: [],
    metrics: [],
    translation: '',
    divisionColor: '',
  };
}
