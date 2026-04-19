import { renderErrorState, renderLoadingState } from '../../components/AsyncState.js';
import { renderDailyChallengeCard } from '../../components/DailyChallengeCard.js';
import { renderSceneCard } from '../../components/SceneCard.js';
import { renderSessionPrompt } from '../../components/SessionState.js';
import { renderStreakCard } from '../../components/StreakCard.js';
import { card, statusPill } from '../../components/primitives.js';
import { h } from '../../lib/helpers/dom.js';
import { getFreshPostScoreReadCache } from '../../lib/api/post-score-refresh.js';
import { fetchDailyChallenge, fetchProfile, fetchSceneConfig } from '../../lib/api/read-data.js';
import { adaptDailyChallenge } from '../../lib/adapters/daily-adapter.js';
import { adaptProfile } from '../../lib/adapters/progress-adapter.js';
import { adaptSceneConfig } from '../../lib/adapters/scene-adapter.js';

export function renderDailyChallengePage({ appState }) {
  const page = h('div', {}, [renderLoadingState('Loading daily challenge')]);

  loadDailyViewModel(appState)
    .then((viewModel) => {
      page.replaceChildren(renderDailySurface(viewModel));
    })
    .catch((error) => {
      page.replaceChildren(renderErrorState(error, { title: 'Daily challenge could not load' }));
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
  return h('article', { className: 'ns-page' }, [
    h('header', { className: 'ns-page__header' }, [
      h('div', {}, [
        h('p', { className: 'ns-eyebrow', text: 'Daily challenge' }),
        h('h2', { text: 'Daily challenge' }),
        h('p', {
          className: 'ns-page__summary',
          text: 'Practice today\'s scene and keep your streak moving when your session is active.',
        }),
      ]),
      statusPill(daily.resetLabel),
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
            title: 'Streak data needs sign-in',
            body: profileError?.message || 'Sign in to show streak status here.',
            children: [statusPill(profileError?.rateLimited ? 'Rate limited' : 'Session')],
          }),
      renderSceneCard({ scene: daily.scene, entrySource: 'daily' }),
    ]),
    h('div', { className: 'ns-grid ns-grid--two' }, [
      card({
        title: 'Daily result summary',
        body: 'Points, streak bonus, and reset timing update after a scored daily take.',
      }),
      card({
        title: 'Daily sync',
        body: 'Daily scene, streak status, profile points, and reset copy update from the current server data.',
      }),
    ]),
  ]);
}
