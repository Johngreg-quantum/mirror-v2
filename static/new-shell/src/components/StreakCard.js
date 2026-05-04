import { h } from '../lib/helpers/dom.js';
import { isDailyComplete } from '../lib/copy/ux-copy.js';
import { statusPill } from './primitives.js';

function getStreakMessage(profile) {
  if (isDailyComplete(profile.dailyStatus)) {
    return profile.streakDays > 1
      ? `Daily complete today. Current streak: ${profile.streakDays} days.`
      : 'Daily complete today. Return tomorrow for the next daily.';
  }

  if (profile.streakDays > 0) {
    return `Today's daily is still open. A scored daily can update the ${profile.streakDays}-day streak.`;
  }

  return 'No daily streak yet. Score a daily to start one.';
}

export function renderStreakCard({ profile }) {
  return h('section', { className: 'ns-streak-card' }, [
    h('p', { className: 'ns-eyebrow', text: 'Streak' }),
    h('strong', { text: `${profile.streakDays} days` }),
    h('p', { text: `${profile.displayName} is in ${profile.division} with ${profile.points.toLocaleString()} points.` }),
    h('p', { text: getStreakMessage(profile) }),
    h('div', { className: 'ns-inline-list' }, [
      statusPill(profile.dailyStatus),
      statusPill(profile.levelTitle),
      statusPill(`${profile.points.toLocaleString()} pts`),
    ]),
  ]);
}
