function formatScore(value, fallback = '--') {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return `${Math.round(numericValue)}%`;
}

function formatDateLabel(value) {
  if (!value) {
    return 'Created recently';
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return 'Created recently';
  }

  return `Created ${new Date(timestamp).toLocaleDateString()}`;
}

function getChallengeOutcome(yourScore, opponentScore) {
  return yourScore > opponentScore ? 'won' : 'lost';
}

export function adaptChallengeEntry(rawChallenge) {
  if (!rawChallenge) {
    return null;
  }

  const scene = rawChallenge.scene || {};

  return {
    id: rawChallenge.challenge_id || 'pending',
    challengerName: rawChallenge.challenger_username || 'Another player',
    sceneId: rawChallenge.scene_id || '',
    sceneTitle: scene.title || scene.movie || rawChallenge.scene_id || 'Unknown scene',
    film: scene.movie || 'Unknown film',
    scene,
    targetScore: Number(rawChallenge.score_to_beat || 0),
    targetScoreLabel: formatScore(rawChallenge.score_to_beat),
    createdLabel: formatDateLabel(rawChallenge.created_at),
  };
}

export function adaptChallengeResult({ challengeEntry, analyzeResult } = {}) {
  if (!challengeEntry || !analyzeResult) {
    return null;
  }

  const yourScore = Number(analyzeResult.sync_score || 0);
  const opponentScore = Number(challengeEntry.targetScore || 0);
  const outcome = getChallengeOutcome(yourScore, opponentScore);

  return {
    challengeId: challengeEntry.id,
    outcome,
    title: outcome === 'won' ? 'You beat the benchmark' : 'The benchmark survived',
    message: outcome === 'won'
      ? `You scored ${formatScore(yourScore)} against ${formatScore(opponentScore)} and cleared the benchmark.`
      : `You scored ${formatScore(yourScore)}. ${formatScore(opponentScore)} is still the score to beat.`,
    yourScore: formatScore(yourScore),
    opponentScore: formatScore(opponentScore),
    comparisonLabel: outcome === 'won' ? 'Challenge beaten' : 'Benchmark still ahead',
    pointsEarned: Math.round(Number(analyzeResult.points_earned || 0)),
    divisionName: analyzeResult.division?.name || 'Unranked',
    streakLabel: `${Math.round(Number(analyzeResult.streak || 0))}-day streak`,
    isDaily: Boolean(analyzeResult.is_daily),
    isNewPersonalBest: Boolean(analyzeResult.is_new_pb),
    analyzeResult,
  };
}
