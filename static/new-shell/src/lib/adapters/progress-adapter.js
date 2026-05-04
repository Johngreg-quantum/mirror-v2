// Maps authenticated read-only `/api/progress`, `/api/profile`, and
// `/api/history` responses into dashboard cards. Mutating score, points, PB,
// and streak behavior remains server-owned.
import { STATUS_COPY } from '../copy/ux-copy.js';

function getHistoryEntries(history) {
  return Array.isArray(history?.history) ? history.history : [];
}

function getStartOfDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function formatHistoryWhenLabel(value) {
  const timestamp = Date.parse(value || '');

  if (!Number.isFinite(timestamp)) {
    return 'Recent take';
  }

  const targetDate = new Date(timestamp);
  const todayStart = getStartOfDay(new Date());
  const targetStart = getStartOfDay(targetDate);
  const diffDays = Math.round((todayStart - targetStart) / 86400000);

  if (diffDays === 0) {
    return 'Today';
  }

  if (diffDays === 1) {
    return 'Yesterday';
  }

  return targetDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTakeDeltaLabel(score, previousScore) {
  const current = Number(score);
  const previous = Number(previousScore);

  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return '';
  }

  const delta = Math.round(current - previous);

  if (delta > 0) {
    return `Up ${delta} from the take before it`;
  }

  if (delta < 0) {
    return `Down ${Math.abs(delta)} from the take before it`;
  }

  return 'Same score as the take before it';
}

export function adaptProfile(rawProfile) {
  if (!rawProfile) {
    return null;
  }

  return {
    displayName: rawProfile.username || 'Performer',
    handle: rawProfile.username ? `@${rawProfile.username}` : '@performer',
    level: null,
    levelTitle: rawProfile.division?.name || 'Unranked',
    points: rawProfile.total_points || 0,
    nextLevelPoints: rawProfile.next_division?.min || rawProfile.total_points || 0,
    division: rawProfile.division?.name || 'Unranked',
    streakDays: rawProfile.streak || 0,
    dailyStatus: rawProfile.daily_done_today ? STATUS_COPY.completedToday : STATUS_COPY.ready,
    rank: null,
    source: rawProfile,
  };
}

export function adaptProgressSummary({ progress, profile, history }) {
  const stats = history?.stats || {};
  const sceneStats = profile?.scene_stats || {};
  const historyEntries = getHistoryEntries(history);
  const distinctPracticeDays = new Set(
    historyEntries
      .map((item) => {
        const timestamp = Date.parse(item.created_at || '');

        if (!Number.isFinite(timestamp)) {
          return '';
        }

        return new Date(timestamp).toDateString();
      })
      .filter(Boolean),
  );
  const historyBestScore = historyEntries.reduce((best, item) => {
    const score = Number(item.sync_score || 0);
    return Number.isFinite(score) && score > best ? score : best;
  }, 0);
  const progressBestScore = Object.values(progress?.best_scores || {}).reduce((best, score) => {
    const numericScore = Number(score || 0);
    return Number.isFinite(numericScore) && numericScore > best ? numericScore : best;
  }, 0);
  const bestScore = Math.max(
    Number(stats.best_score || 0),
    historyBestScore,
    progressBestScore,
  );
  const totalAttempts = Number(stats.total_attempts || historyEntries.length || 0);
  const improvement = Number.isFinite(Number(stats.improvement))
    ? Math.round(Number(stats.improvement))
    : null;

  return {
    scoreAverage: Math.round(stats.avg_score || 0),
    scenesCompleted: stats.unique_scenes || Object.keys(sceneStats).length,
    personalBests: Object.keys(progress?.best_scores || {}).length,
    unlockedScenes: progress?.unlocked_scenes?.length || 0,
    weeklyMinutes: Math.max(0, Math.round((stats.total_attempts || 0) * 0.75)),
    nextUnlockScore: progress?.next_level?.required_score || 0,
    totalAttempts,
    bestScore: Math.round(bestScore || 0),
    activeDays: distinctPracticeDays.size,
    improvement,
  };
}

export function adaptPersonalBests({ progress, scenes }) {
  return Object.entries(progress?.best_scores || {})
    .map(([sceneId, score]) => {
      const scene = scenes.find((item) => item.id === sceneId);
      return {
        sceneTitle: scene?.title || sceneId,
        film: scene?.film || sceneId,
        score: Math.round(score),
        date: 'Best',
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function adaptRecentHistory(history) {
  const entries = getHistoryEntries(history).slice(0, 6);

  return entries.map((item, index) => ({
    sceneTitle: item.movie || item.scene_id,
    score: Math.round(item.sync_score || 0),
    delta: formatTakeDeltaLabel(item.sync_score, entries[index + 1]?.sync_score),
    result: formatHistoryWhenLabel(item.created_at),
    whenLabel: formatHistoryWhenLabel(item.created_at),
  }));
}

export function adaptFocusAreas(history) {
  const entries = getHistoryEntries(history);

  if (!entries.length) {
    return ['Record a first take to show score-based notes.'];
  }

  const latestScore = Number(entries[0]?.sync_score || 0);
  const previousScore = Number(entries[1]?.sync_score || 0);
  const repeatedScenes = new Set();
  const seenScenes = new Set();

  entries.forEach((item) => {
    if (seenScenes.has(item.scene_id)) {
      repeatedScenes.add(item.scene_id);
      return;
    }

    seenScenes.add(item.scene_id);
  });

  const notes = [];

  if (Number.isFinite(latestScore) && Number.isFinite(previousScore) && entries.length > 1) {
    if (latestScore > previousScore) {
      notes.push('The most recent score is up from the previous take. Repeat the scene to see if it holds.');
    } else if (latestScore < previousScore) {
      notes.push('The most recent score is down from the previous take. Repeat the same scene for a direct comparison.');
    } else {
      notes.push('The last two takes have the same score. A repeat will make small changes easier to read.');
    }
  }

  if (repeatedScenes.size) {
    notes.push('Repeated scenes now appear in history. Compare those scores first.');
  } else {
    notes.push('Repeat a scene to make score changes easier to compare.');
  }

  notes.push('Daily gives you a dated score when you want one return point.');

  return notes.slice(0, 3);
}
