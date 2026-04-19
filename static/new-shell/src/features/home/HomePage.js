import { renderLeaderboardPanel } from '../../components/LeaderboardPanel.js';
import { renderProgressStatCard } from '../../components/ProgressStatCard.js';
import { renderSceneCard } from '../../components/SceneCard.js';
import { renderStreakCard } from '../../components/StreakCard.js';
import { renderErrorState, renderLoadingState } from '../../components/AsyncState.js';
import { buttonLink, card, statusPill } from '../../components/primitives.js';
import { h } from '../../lib/helpers/dom.js';
import { getFreshPostScoreReadCache } from '../../lib/api/post-score-refresh.js';
import { loadPersonalReadData, loadPublicHomeData } from '../../lib/api/read-data.js';
import { adaptLeaderboard } from '../../lib/adapters/leaderboard-adapter.js';
import { adaptProgressSummary, adaptProfile } from '../../lib/adapters/progress-adapter.js';
import { adaptSceneConfig } from '../../lib/adapters/scene-adapter.js';
import { createAppHref } from '../../lib/routing/navigation.js';

export function renderHomePage({ appState, actions }) {
  const page = h('div', {}, [renderLoadingState('Loading scene browser')]);

  loadHomeViewModel({ appState, actions })
    .then((viewModel) => {
      page.replaceChildren(renderHomeSurface({ appState, ...viewModel }));
    })
    .catch((error) => {
      page.replaceChildren(renderErrorState(error, { title: 'Scene browser could not load' }));
    });

  return page;
}

async function loadHomeViewModel({ appState, actions }) {
  const postScoreCache = getFreshPostScoreReadCache(appState);
  const publicData = (
    postScoreCache?.sceneConfig
    && !postScoreCache?.errors?.sceneConfig
    && postScoreCache?.daily
    && !postScoreCache?.errors?.daily
    && postScoreCache?.leaderboard
    && !postScoreCache?.errors?.leaderboard
  )
    ? {
        sceneConfig: postScoreCache.sceneConfig,
        daily: postScoreCache.daily,
        leaderboard: postScoreCache.leaderboard,
      }
    : await loadPublicHomeData();
  await actions.session?.waitForInitialSession?.();
  const session = appState.session;
  let personalData = null;
  let personalError = null;

  if (session?.status === 'authenticated') {
    if (
      postScoreCache?.progress
      && !postScoreCache?.errors?.progress
      && postScoreCache?.profile
      && !postScoreCache?.errors?.profile
      && postScoreCache?.history
      && !postScoreCache?.errors?.history
    ) {
      personalData = {
        progress: postScoreCache.progress,
        profile: postScoreCache.profile,
        history: postScoreCache.history,
      };
    } else {
      try {
        personalData = await loadPersonalReadData();
      } catch (error) {
        personalError = error;
      }
    }
  }

  const { scenes } = adaptSceneConfig(publicData.sceneConfig, {
    progress: personalData?.progress || null,
    daily: publicData.daily,
  });
  const leaderboard = adaptLeaderboard(publicData.leaderboard, scenes, publicData.daily.scene_id);
  const profile = adaptProfile(personalData?.profile);
  const progressSummary = personalData
    ? adaptProgressSummary(personalData)
    : {
        scoreAverage: scenes.length ? '--' : 0,
        scenesCompleted: scenes.length,
        personalBests: '--',
        unlockedScenes: scenes.length,
      };

  return {
    scenes,
    leaderboard,
    profile,
    progressSummary,
    personalError,
  };
}

function renderHomeSurface({ appState, scenes, leaderboard, profile, progressSummary, personalError }) {
  return h('article', { className: 'ns-page' }, [
    h('section', { className: 'ns-home-hero' }, [
      h('div', {}, [
        h('p', { className: 'ns-eyebrow', text: 'Scene browser' }),
        h('h2', { text: profile ? `Welcome back, ${profile.displayName}` : 'Choose a scene' }),
        h('p', {
          text: 'Browse scenes, check today\'s challenge, and keep your practice streak moving.',
        }),
        h('div', { className: 'ns-action-row' }, [
          buttonLink({ href: createAppHref('/daily'), text: 'Daily challenge' }),
          buttonLink({ href: createAppHref('/progress'), text: 'View progress', variant: 'secondary' }),
        ]),
      ]),
      profile
        ? renderStreakCard({ profile })
        : card({
            title: 'Personal data paused',
            body: personalError?.message || 'Sign in to personalize streak, locks, and progress here.',
            children: [statusPill(personalError?.rateLimited ? 'Rate limited' : 'Session auth')],
          }),
    ]),
    h('div', { className: 'ns-grid ns-grid--four' }, [
      renderProgressStatCard({ label: 'Average', value: progressSummary.scoreAverage, detail: 'practice average' }),
      renderProgressStatCard({ label: 'Completed', value: progressSummary.scenesCompleted, detail: 'scenes finished' }),
      renderProgressStatCard({ label: 'PBs', value: progressSummary.personalBests, detail: 'personal bests set' }),
      renderProgressStatCard({ label: 'Visible', value: progressSummary.unlockedScenes, detail: 'available scenes' }),
    ]),
    h('section', { className: 'ns-stack' }, [
      h('div', { className: 'ns-section-heading' }, [
        h('div', {}, [
          h('p', { className: 'ns-eyebrow', text: 'Scenes' }),
          h('h2', { text: 'Scene browser' }),
        ]),
        statusPill('Live scene config'),
      ]),
      scenes.length
        ? h('div', { className: 'ns-scene-grid' }, scenes.map((scene) => renderSceneCard({ scene, entrySource: 'home' })))
        : card({ title: 'No scenes found', body: 'Scenes will appear here when the catalog is ready.' }),
    ]),
    h('div', { className: 'ns-grid ns-grid--two' }, [
      leaderboard.rows.length
        ? renderLeaderboardPanel({ leaderboard, entrySource: 'leaderboard' })
        : card({ title: 'Leaderboard is empty', body: 'Scores will appear here after scored takes are submitted.' }),
      card({
        title: 'Practice sync',
        body: 'Scene availability, leaderboard rows, progress, and profile data stay in sync with your latest scored takes.',
      }),
    ]),
  ]);
}
