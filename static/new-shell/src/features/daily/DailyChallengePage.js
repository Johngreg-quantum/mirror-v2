import { renderLoggedErrorState, renderLoadingState } from '../../components/AsyncState.js';
import { renderDailyChallengeCard } from '../../components/DailyChallengeCard.js';
import { renderSceneCard } from '../../components/SceneCard.js';
import { renderSessionPrompt } from '../../components/SessionState.js';
import { renderStreakCard } from '../../components/StreakCard.js';
import { buttonLink, card, statusPill } from '../../components/primitives.js';
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

  return h('article', { className: 'ns-page' }, [
    h('header', { className: 'ns-page__header' }, [
      h('div', {}, [
        h('p', { className: 'ns-eyebrow', text: isComplete ? 'Daily complete' : 'Today only' }),
        h('h2', { text: isComplete ? 'Nice work. Come back tomorrow.' : 'Keep today\'s streak alive' }),
        h('p', {
          className: 'ns-page__summary',
          text: isComplete
            ? 'Today\'s scored take is banked. Use the rest of the day to chase a cleaner run or build progress on another scene.'
            : 'One scored daily take keeps the habit visible, adds reward points, and gives you a clear reason to return tomorrow.',
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
        title: isComplete ? 'Daily reward banked' : 'Daily reward',
        body: isComplete
          ? `Your daily status is ${daily.status}. The next reset is already counting down.`
          : `${daily.rewardPoints} points plus ${daily.streakBonus} are attached to the first scored completion.`,
        children: [
          h('div', { className: 'ns-action-row' }, [
            buttonLink({ href: createAppHref('/progress'), text: 'Open Progress', variant: 'secondary' }),
            buttonLink({ href: createAppHref('/'), text: 'Find another scene', variant: 'secondary' }),
          ]),
        ],
      }),
      card({
        title: 'Tomorrow hook',
        body: 'The daily scene, streak status, profile points, and reset copy update from current server data so the next habit prompt stays honest.',
      }),
    ]),
  ]);
}
