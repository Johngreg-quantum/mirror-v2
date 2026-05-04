import { renderLoggedErrorState, renderLoadingState } from '../../components/AsyncState.js';
import { renderProgressStatCard } from '../../components/ProgressStatCard.js';
import { renderStreakCard } from '../../components/StreakCard.js';
import { buttonLink, card, statusPill } from '../../components/primitives.js';
import { CTA_COPY, SECTION_COPY, STATUS_COPY, STATE_COPY, isDailyComplete } from '../../lib/copy/ux-copy.js';
import { h } from '../../lib/helpers/dom.js';
import { getFreshPostScoreReadCache } from '../../lib/api/post-score-refresh.js';
import { fetchHistory, fetchProfile, fetchProgress, fetchSceneConfig } from '../../lib/api/read-data.js';
import {
  adaptFocusAreas,
  adaptPersonalBests,
  adaptProgressSummary,
  adaptProfile,
  adaptRecentHistory,
} from '../../lib/adapters/progress-adapter.js';
import { adaptSceneConfig } from '../../lib/adapters/scene-adapter.js';
import { createAppHref } from '../../lib/routing/navigation.js';

export function renderProgressDashboardPage({ appState }) {
  const page = h('div', {}, [renderLoadingState('Loading progress dashboard')]);

  loadProgressViewModel(appState)
    .then((viewModel) => {
      page.replaceChildren(renderProgressSurface(viewModel));
    })
    .catch((error) => {
      page.replaceChildren(renderLoggedErrorState(error, {
        title: 'Progress dashboard unavailable',
        surface: 'progress',
      }));
    });

  return page;
}

async function loadProgressViewModel(appState) {
  const postScoreCache = getFreshPostScoreReadCache(appState);
  const [sceneConfig, progress, profile, history] = await Promise.all([
    postScoreCache?.sceneConfig && !postScoreCache?.errors?.sceneConfig
      ? Promise.resolve(postScoreCache.sceneConfig)
      : fetchSceneConfig(),
    postScoreCache?.progress && !postScoreCache?.errors?.progress
      ? Promise.resolve(postScoreCache.progress)
      : fetchProgress(),
    postScoreCache?.profile && !postScoreCache?.errors?.profile
      ? Promise.resolve(postScoreCache.profile)
      : fetchProfile(),
    postScoreCache?.history && !postScoreCache?.errors?.history
      ? Promise.resolve(postScoreCache.history)
      : fetchHistory(),
  ]);
  const { scenes } = adaptSceneConfig(sceneConfig, { progress });

  return {
    profile: adaptProfile(profile),
    progressSummary: adaptProgressSummary({ progress, profile, history }),
    personalBests: adaptPersonalBests({ progress, scenes }),
    recentHistory: adaptRecentHistory(history),
    focusAreas: adaptFocusAreas(history),
  };
}

function getMomentumSummary({ profile, progressSummary, recentHistory }) {
  const latestTake = recentHistory[0] || null;

  if (!recentHistory.length) {
    return {
      title: STATE_COPY.noScoredTakes,
      body: 'After one saved score, this page can show a baseline.',
    };
  }

  if (progressSummary.improvement !== null && progressSummary.improvement > 0) {
    return {
      title: `Recent change: +${progressSummary.improvement}`,
      body: `${profile.displayName}'s recent scores are up from the previous line.`,
    };
  }

  if (progressSummary.improvement !== null && progressSummary.improvement < 0) {
    return {
      title: `Recent change: ${progressSummary.improvement}`,
      body: 'Recent scores are down from the previous line. Repeat a familiar scene for a direct comparison.',
    };
  }

  return {
    title: `Latest score: ${latestTake.score}`,
    body: latestTake.delta
      ? latestTake.delta
      : 'Recent saved scores are ready to review.',
  };
}

function getReturnCue({ profile, recentHistory }) {
  if (isDailyComplete(profile.dailyStatus)) {
    return profile.streakDays > 0
      ? `Daily is complete today. Return tomorrow for the next daily.`
      : 'Daily is complete today. The next daily appears tomorrow.';
  }

  if (profile.streakDays > 0) {
    return 'Today\'s daily is still open. A scored daily can update the streak.';
  }

  if (recentHistory.length) {
    return 'Return when you want another dated score in the history.';
  }

  return 'Start with one saved score. The next visit will have history to show.';
}

function renderPersonalBestList(personalBests) {
  return h('ul', { className: 'ns-progress-list' }, personalBests.map((best) => h('li', { className: 'ns-progress-entry' }, [
    h('div', { className: 'ns-progress-entry__copy' }, [
      h('strong', { text: best.sceneTitle }),
      h('p', { className: 'ns-muted', text: `${best.film} - saved personal best.` }),
    ]),
    h('span', { className: 'ns-progress-entry__value', text: String(best.score) }),
  ])));
}

function renderRecentHistoryList(recentHistory) {
  return h('ul', { className: 'ns-progress-list' }, recentHistory.map((item) => h('li', { className: 'ns-progress-entry' }, [
    h('div', { className: 'ns-progress-entry__copy' }, [
      h('strong', { text: item.sceneTitle }),
      h('p', { className: 'ns-muted', text: item.delta || item.whenLabel }),
    ]),
    h('div', { className: 'ns-progress-entry__meta' }, [
      h('span', { className: 'ns-progress-entry__value', text: String(item.score) }),
      h('span', { className: 'ns-progress-entry__date', text: item.whenLabel }),
    ]),
  ])));
}

function renderProgressSurface({ profile, progressSummary, personalBests, recentHistory, focusAreas }) {
  const hasPersonalBests = personalBests.length > 0;
  const hasRecentHistory = recentHistory.length > 0;
  const momentumSummary = getMomentumSummary({ profile, progressSummary, recentHistory });
  const returnCue = getReturnCue({ profile, recentHistory });

  return h('article', { className: 'ns-page ns-progress-page' }, [
    h('header', { className: 'ns-page__header ns-page__header--progress' }, [
      h('div', {}, [
        h('p', { className: 'ns-eyebrow', text: SECTION_COPY.progress }),
        h('h2', { text: SECTION_COPY.progress }),
        h('p', {
          className: 'ns-page__summary',
          text: hasRecentHistory
            ? `${profile.displayName} has ${progressSummary.totalAttempts} scored take${progressSummary.totalAttempts === 1 ? '' : 's'} across ${progressSummary.activeDays} active day${progressSummary.activeDays === 1 ? '' : 's'}. Best saved score: ${progressSummary.bestScore}.`
            : `${profile.displayName} is in ${profile.division}. The first saved score starts this view.`,
        }),
      ]),
      h('div', { className: 'ns-inline-list ns-page__actions' }, [
        statusPill(hasRecentHistory ? 'Synced' : STATUS_COPY.noScoresYet),
      ]),
    ]),
    h('div', { className: 'ns-grid ns-grid--two ns-progress-hero-grid' }, [
      renderStreakCard({ profile }),
      card({
        title: momentumSummary.title,
        body: momentumSummary.body,
        className: 'ns-progress-momentum-card',
        children: [
          h('div', { className: 'ns-inline-list' }, [
            statusPill(`${progressSummary.totalAttempts} takes`),
            statusPill(`Best ${progressSummary.bestScore || '--'}`),
            statusPill(`${progressSummary.activeDays} active day${progressSummary.activeDays === 1 ? '' : 's'}`),
          ]),
        ],
      }),
    ]),
    h('div', { className: 'ns-grid ns-grid--four ns-stat-strip ns-progress-stat-strip' }, [
      renderProgressStatCard({ label: 'Average', value: progressSummary.scoreAverage, detail: 'saved average' }),
      renderProgressStatCard({ label: 'Best', value: progressSummary.bestScore || '--', detail: 'best saved score' }),
      renderProgressStatCard({ label: 'Takes', value: progressSummary.totalAttempts, detail: 'saved scores' }),
      renderProgressStatCard({ label: 'Active days', value: progressSummary.activeDays, detail: 'days with scores' }),
    ]),
    h('div', { className: 'ns-grid ns-grid--three ns-progress-insight-grid' }, [
      card({
        title: 'Personal bests',
        body: hasPersonalBests
          ? 'Highest saved score by scene.'
          : STATE_COPY.personalBestsAfterScores,
        className: 'ns-progress-card',
        children: [
          hasPersonalBests
            ? renderPersonalBestList(personalBests)
            : h('div', { className: 'ns-action-row ns-action-row--card' }, [
                buttonLink({ href: createAppHref('/'), text: CTA_COPY.backHome }),
                buttonLink({ href: createAppHref('/daily'), text: CTA_COPY.openDaily, variant: 'secondary' }),
              ]),
        ],
      }),
      card({
        title: 'Recent trail',
        body: hasRecentHistory
          ? 'Last saved scores.'
          : 'Recent scores appear after a saved take.',
        className: 'ns-progress-card',
        children: [
          hasRecentHistory
            ? renderRecentHistoryList(recentHistory)
            : h('div', { className: 'ns-inline-list' }, [
                statusPill(STATUS_COPY.noScoresYet),
              ]),
        ],
      }),
      card({
        title: 'What the trail suggests',
        body: hasRecentHistory
          ? 'Score-based notes from the saved history.'
          : 'Notes appear after score history exists.',
        className: 'ns-progress-card ns-support-card',
        children: [
          h('ul', { className: 'ns-focus-list' }, focusAreas.map((area) => h('li', { text: area }))),
        ],
      }),
    ]),
    card({
      title: hasRecentHistory ? 'Daily return' : 'After a first score',
      body: hasRecentHistory
        ? returnCue
        : 'Progress needs saved scores before it can summarize a session.',
      className: 'ns-progress-return-card ns-support-card',
    }),
  ]);
}
