import { renderLoggedErrorState, renderLoadingState } from '../../components/AsyncState.js';
import { renderDailyChallengeCard } from '../../components/DailyChallengeCard.js';
import { renderSceneCard } from '../../components/SceneCard.js';
import { renderSessionPrompt } from '../../components/SessionState.js';
import { renderStreakCard } from '../../components/StreakCard.js';
import { buttonLink, card, statusPill } from '../../components/primitives.js';
import { CTA_COPY, STATUS_COPY } from '../../lib/copy/ux-copy.js';
import { h } from '../../lib/helpers/dom.js';
import { getFreshPostScoreReadCache } from '../../lib/api/post-score-refresh.js';
import { fetchDailyChallenge, fetchProfile, fetchSceneConfig } from '../../lib/api/read-data.js';
import { adaptDailyChallenge } from '../../lib/adapters/daily-adapter.js';
import { adaptProfile } from '../../lib/adapters/progress-adapter.js';
import { adaptSceneConfig } from '../../lib/adapters/scene-adapter.js';
import { createAppHref } from '../../lib/routing/navigation.js';

export function renderDailyChallengePage({ appState }) {
  const page = h('div', {}, [renderLoadingState('Loading daily challenge')]);

  loadDailyViewModel(appState)
    .then((viewModel) => {
      page.replaceChildren(renderDailySurface(viewModel));
    })
    .catch((error) => {
      page.replaceChildren(renderLoggedErrorState(error, {
        title: 'Daily challenge could not load',
        surface: 'daily',
      }));
    });

  return page;
}

async function loadDailyViewModel(appState) {
  const session = appState.session;
  const postScoreCache = getFreshPostScoreReadCache(appState);
  const [sceneConfig, rawDaily] = await Promise.all([
    postScoreCache?.sceneConfig && !postScoreCache?.errors?.sceneConfig
      ? Promise.resolve(postScoreCache.sceneConfig)
      : fetchSceneConfig(),
    postScoreCache?.daily && !postScoreCache?.errors?.daily
      ? Promise.resolve(postScoreCache.daily)
      : fetchDailyChallenge(),
  ]);
  let rawProfile = null;
  let profileError = null;

  if (session?.status === 'authenticated') {
    if (postScoreCache?.profile && !postScoreCache?.errors?.profile) {
      rawProfile = postScoreCache.profile;
    } else {
      try {
        rawProfile = await fetchProfile();
      } catch (error) {
        profileError = error;
      }
    }
  }

  const { scenes } = adaptSceneConfig(sceneConfig, { daily: rawDaily });
  const profile = adaptProfile(rawProfile);
  const daily = adaptDailyChallenge(rawDaily, scenes, profile);

  return {
    daily,
    profile,
    profileError,
    session,
  };
}

function renderDailySurface({ daily, profile, profileError, session }) {
  const isComplete = /completed|done/i.test(String(daily.status || ''));
  const isAuthenticated = session?.status === 'authenticated';

  return h('article', { className: 'ns-page' }, [
    h('header', { className: 'ns-page__header' }, [
      h('div', {}, [
        h('p', { className: 'ns-eyebrow', text: isComplete ? 'Daily complete' : 'Today only' }),
        h('h2', { text: isComplete ? 'Daily complete' : 'Today\'s daily' }),
        h('p', {
          className: 'ns-page__summary',
          text: isComplete
            ? 'Today\'s daily score is saved. The next daily appears after reset.'
            : 'Score today\'s daily to update daily status, points, and streak data.',
        }),
      ]),
      h('div', { className: 'ns-inline-list ns-page__actions' }, [
        statusPill(daily.status),
        statusPill(daily.resetLabel),
      ]),
    ]),
    renderSessionPrompt({
      session,
      title: 'Streak data needs sign-in',
      body: 'The daily scene is public. Streak status appears after your session is verified.',
    }),
    renderDailyChallengeCard({ daily }),
    h('div', { className: 'ns-grid ns-grid--two' }, [
      profile
        ? renderStreakCard({ profile })
        : card({
            title: profileError ? STATUS_COPY.dailyStatusUnavailable : 'Streak data needs sign-in',
            body: profileError?.message || (isAuthenticated
              ? 'Account daily status will appear when profile data is available.'
              : 'Sign in to show streak status here.'),
            className: 'ns-state-card ns-state-card--auth',
            children: [statusPill(profileError?.rateLimited ? STATUS_COPY.rateLimited : isAuthenticated ? 'Session active' : 'Session')],
          }),
      renderSceneCard({ scene: daily.scene, entrySource: 'daily' }),
    ]),
    h('div', { className: 'ns-grid ns-grid--two' }, [
      card({
        title: isComplete ? 'Daily saved' : 'Daily reward',
        body: isComplete
          ? `Daily status: ${daily.status}. Next reset: ${daily.resetLabel}.`
          : `${daily.rewardPoints} points plus ${daily.streakBonus} are attached to the first scored completion.`,
        children: [
          h('div', { className: 'ns-action-row ns-action-row--card' }, [
            isAuthenticated
              ? buttonLink({ href: createAppHref('/progress'), text: CTA_COPY.viewProgress, variant: 'secondary' })
              : null,
            buttonLink({ href: createAppHref('/'), text: CTA_COPY.backHome, variant: 'secondary' }),
          ]),
        ],
      }),
      card({
        title: 'Daily reset',
        body: 'Daily scene, streak status, profile points, and reset text come from current server data.',
      }),
    ]),
  ]);
}
