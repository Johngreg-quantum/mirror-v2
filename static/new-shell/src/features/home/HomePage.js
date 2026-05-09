import { renderLeaderboardPanel } from '../../components/LeaderboardPanel.js';
import { renderProgressStatCard } from '../../components/ProgressStatCard.js';
import { renderSceneCard } from '../../components/SceneCard.js';
import { renderStreakCard } from '../../components/StreakCard.js';
import { renderLoggedErrorState, renderLoadingState } from '../../components/AsyncState.js';
import { buttonLink, card, statusPill } from '../../components/primitives.js';
import { CTA_COPY, SECTION_COPY, STATUS_COPY, isDailyComplete, savedTakeSummary } from '../../lib/copy/ux-copy.js';
import { h } from '../../lib/helpers/dom.js';
import { getFreshPostScoreReadCache } from '../../lib/api/post-score-refresh.js';
import { loadPersonalReadData, loadPublicHomeData } from '../../lib/api/read-data.js';
import { adaptLeaderboard } from '../../lib/adapters/leaderboard-adapter.js';
import { adaptProgressSummary, adaptProfile, adaptRecentHistory } from '../../lib/adapters/progress-adapter.js';
import { adaptSceneConfig } from '../../lib/adapters/scene-adapter.js';
import { createAppHref } from '../../lib/routing/navigation.js';
import { sceneHref } from '../../lib/routing/scene-routes.js';

function sortScenesForProgression(scenes = []) {
  return [...scenes].sort((left, right) => {
    if (left.locked !== right.locked) {
      return left.locked ? 1 : -1;
    }

    if (left.level !== right.level) {
      return left.level - right.level;
    }

    if ((left.personalBest === null) !== (right.personalBest === null)) {
      return left.personalBest === null ? -1 : 1;
    }

    if (left.levelSceneNumber !== right.levelSceneNumber) {
      return left.levelSceneNumber - right.levelSceneNumber;
    }

    return left.title.localeCompare(right.title);
  });
}

function getRecommendedScene(scenes = []) {
  return scenes.find((scene) => !scene.locked && scene.personalBest === null)
    || scenes.find((scene) => !scene.locked)
    || scenes[0]
    || null;
}

function getSignedInHeroBody({ profile, recommendedScene, latestTake, personalError }) {
  if (personalError) {
    return recommendedScene
      ? `Saved progress did not load, but ${recommendedScene.title} is still available.`
      : 'Saved progress did not load. Scene practice will appear when the catalog is available.';
  }

  if (!recommendedScene) {
    return `${profile?.displayName || 'Your account'}, Home will show a practice option when the catalog is available.`;
  }

  if (latestTake && latestTake.sceneTitle === recommendedScene.title) {
    return `Last saved score: ${latestTake.score} on ${latestTake.sceneTitle}. Repeat the scene while the take is directly comparable.`;
  }

  if (latestTake) {
    return `Last saved score: ${latestTake.score} on ${latestTake.sceneTitle}. Recommended now: ${recommendedScene.title}.`;
  }

  return `${recommendedScene.title} is available now and fits your current scene path.`;
}

function getSignedInPrimaryCtaLabel({ recommendedScene, latestTake }) {
  if (!recommendedScene) {
    return CTA_COPY.startPractice;
  }

  if (latestTake && latestTake.sceneTitle === recommendedScene.title) {
    return CTA_COPY.repeatScene;
  }

  if (recommendedScene.isDaily) {
    return CTA_COPY.openDaily;
  }

  if (recommendedScene.locked) {
    return CTA_COPY.openLockedScene;
  }

  return CTA_COPY.openNextScene;
}

function getNextUpBody(scene) {
  if (!scene) {
    return 'A practice scene will appear when the catalog is available.';
  }

  if (scene.locked) {
    return 'This scene is visible, but recording waits until it unlocks for this session.';
  }

  return `${scene.title} is available now and fits your current scene path.`;
}

function getDailySupportBody({ dailyScene, recommendedScene, profile }) {
  if (!dailyScene) {
    return 'Daily appears when public scene data is available.';
  }

  if (isDailyComplete(profile?.dailyStatus)) {
    return recommendedScene?.id === dailyScene.id
      ? 'Daily is complete. Repeat it only if you want another read on this scene.'
      : 'Daily is complete. Use the recommended scene for the next saved score.';
  }

  if (recommendedScene?.id === dailyScene.id) {
    return 'Daily matches the recommended scene. One score updates both views.';
  }

  return 'Daily is available when you want today\'s saved score.';
}

function getProgressSupportBody({ progressSummary }) {
  return savedTakeSummary(progressSummary);
}

function renderHomeAccountCard({ isAuthenticated, personalError }) {
  if (isAuthenticated) {
    return card({
      title: personalError ? 'Saved state unavailable' : 'Account session active',
      body: personalError?.message || 'Your account session is active. Saved progress appears here when profile data is available.',
      className: 'ns-support-card ns-state-card--auth',
      children: [
        statusPill(personalError?.rateLimited ? STATUS_COPY.rateLimited : 'Session active'),
        personalError
          ? null
          : buttonLink({ href: createAppHref('/progress'), text: CTA_COPY.viewProgress, variant: 'secondary' }),
      ],
    });
  }

  return card({
    title: 'Browse now. Save after sign-in.',
    body: personalError?.message || 'You can open scenes as a guest. Sign in when you want scores, streaks, unlock state, and challenge context saved to your account.',
    className: 'ns-support-card',
    children: [
      statusPill(personalError?.rateLimited ? STATUS_COPY.rateLimited : 'Guest session'),
      buttonLink({ href: createAppHref('/auth'), text: CTA_COPY.createAccount, variant: 'secondary' }),
    ],
  });
}

export function renderHomePage({ appState, actions }) {
  const page = h('div', {}, [renderLoadingState('Loading scene browser')]);

  loadHomeViewModel({ appState, actions })
    .then((viewModel) => {
      page.replaceChildren(renderHomeSurface({ appState, ...viewModel }));
    })
    .catch((error) => {
      page.replaceChildren(renderLoggedErrorState(error, {
        title: 'Scene browser could not load',
        surface: 'home',
      }));
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
        totalAttempts: 0,
        bestScore: '--',
        activeDays: 0,
      };
  const recentHistory = personalData ? adaptRecentHistory(personalData.history) : [];

  return {
    scenes,
    leaderboard,
    profile,
    progressSummary,
    recentHistory,
    personalError,
  };
}

function renderHomeSurface({ appState, scenes, leaderboard, profile, progressSummary, recentHistory, personalError }) {
  const isAuthenticated = appState.session?.status === 'authenticated';
  const orderedScenes = sortScenesForProgression(scenes);
  const recommendedScene = getRecommendedScene(orderedScenes);
  const starterScene = recommendedScene
    || orderedScenes.find((scene) => scene.isDaily && !scene.locked)
    || orderedScenes.find((scene) => !scene.locked)
    || orderedScenes[0];
  const dailyScene = orderedScenes.find((scene) => scene.isDaily) || null;
  const openSceneCount = orderedScenes.filter((scene) => !scene.locked).length;
  const latestTake = recentHistory[0] || null;
  const catalogScenes = orderedScenes.filter((scene) => scene.id !== starterScene?.id);
  const heroPrimaryCta = getSignedInPrimaryCtaLabel({
    recommendedScene: starterScene,
    latestTake,
  });

  return h('article', { className: 'ns-page ns-home-page' }, [
    h('section', { className: 'ns-home-hero' }, [
      h('div', { className: 'ns-home-hero__copy' }, [
        h('p', { className: 'ns-eyebrow', text: isAuthenticated ? 'Return point' : 'Scene practice with scoring' }),
        h('h2', {
          text: profile
            ? `Welcome back, ${profile.displayName}`
            : isAuthenticated ? 'Practice from the current catalog.' : 'Practice a scene. Hear the take. Get a score.',
        }),
        h('p', {
          text: isAuthenticated
            ? getSignedInHeroBody({ profile, recommendedScene: starterScene, latestTake, personalError })
            : 'Open a scene as a guest to preview the line. Sign in when you are ready to record and save a score.',
        }),
        h('div', { className: 'ns-action-row ns-action-row--hero' }, [
          starterScene
            ? buttonLink({ href: sceneHref(starterScene.id, { from: 'home' }), text: isAuthenticated ? heroPrimaryCta : CTA_COPY.startScene })
            : buttonLink({ href: createAppHref('/daily'), text: CTA_COPY.openDaily }),
          isAuthenticated && dailyScene && dailyScene.id !== starterScene?.id
            ? buttonLink({ href: sceneHref(dailyScene.id, { from: 'daily' }), text: CTA_COPY.openDaily, variant: 'secondary' })
            : !isAuthenticated
              ? buttonLink({
                  href: createAppHref('/auth'),
                  text: CTA_COPY.signInToSaveProgress,
                  variant: 'secondary',
                })
              : null,
        ]),
      ]),
      profile
        ? renderStreakCard({ profile })
        : renderHomeAccountCard({ isAuthenticated, personalError }),
    ]),
    isAuthenticated
      ? h('div', { className: 'ns-grid ns-grid--three ns-practice-strip' }, [
          starterScene
            ? card({
                title: SECTION_COPY.nextUp,
                body: getNextUpBody(starterScene),
                className: 'ns-practice-card ns-practice-card--primary',
                children: [
                  h('div', { className: 'ns-inline-list' }, [
                    statusPill(starterScene.levelName),
                    statusPill(`Scene ${starterScene.levelSceneNumber} of ${starterScene.levelSceneCount}`),
                    starterScene.personalBest === null ? statusPill(STATUS_COPY.noPersonalBest) : statusPill(`PB ${starterScene.personalBest ?? '--'}`),
                  ]),
                  h('div', { className: 'ns-action-row ns-action-row--card' }, [
                    buttonLink({ href: sceneHref(starterScene.id, { from: 'home' }), text: heroPrimaryCta }),
                    buttonLink({ href: createAppHref('/levels'), text: CTA_COPY.viewLevels, variant: 'secondary' }),
                  ]),
                ],
              })
            : null,
          dailyScene
            ? card({
                title: SECTION_COPY.daily,
                body: getDailySupportBody({ dailyScene, recommendedScene: starterScene, profile }),
                className: 'ns-practice-card ns-practice-card--support',
                children: [
                  h('div', { className: 'ns-inline-list' }, [
                    statusPill(dailyScene.title),
                    statusPill(profile?.dailyStatus || STATUS_COPY.ready),
                    statusPill(dailyScene.levelName),
                  ]),
                  h('div', { className: 'ns-action-row ns-action-row--card' }, [
                    buttonLink({
                      href: sceneHref(dailyScene.id, { from: 'daily' }),
                      text: CTA_COPY.openDaily,
                      variant: 'secondary',
                    }),
                  ]),
                ],
              })
            : null,
          card({
            title: SECTION_COPY.progress,
            body: personalError
              ? 'Saved progress did not load. Practice can continue from the current catalog.'
              : getProgressSupportBody({ progressSummary }),
            className: 'ns-practice-card ns-practice-card--support',
            children: [
              personalError
                ? h('div', { className: 'ns-inline-list' }, [
                    statusPill(personalError.rateLimited ? STATUS_COPY.rateLimited : STATUS_COPY.readOnlyFetchFailed),
                    statusPill(`${openSceneCount} open scene${openSceneCount === 1 ? '' : 's'}`),
                  ])
                : h('div', { className: 'ns-inline-list' }, [
                    statusPill(`Avg ${progressSummary.scoreAverage}`),
                    statusPill(`PBs ${progressSummary.personalBests}`),
                    statusPill(`Scenes ${progressSummary.scenesCompleted}`),
                  ]),
              personalError
                ? null
                : h('div', { className: 'ns-action-row ns-action-row--card' }, [
                    buttonLink({ href: createAppHref('/progress'), text: CTA_COPY.viewProgress, variant: 'secondary' }),
                  ]),
            ],
          }),
        ])
      : h('div', { className: 'ns-grid ns-grid--four ns-stat-strip' }, [
          renderProgressStatCard({ label: 'Scenes', value: orderedScenes.length, detail: 'in catalog' }),
          renderProgressStatCard({ label: 'Open now', value: openSceneCount, detail: 'available scenes' }),
          renderProgressStatCard({ label: 'Daily', value: dailyScene ? STATUS_COPY.ready : '--', detail: 'today\'s scene' }),
          renderProgressStatCard({ label: 'Progress', value: '--', detail: 'after sign-in' }),
        ]),
    h('section', { className: 'ns-stack ns-section-block ns-home-catalog' }, [
      h('div', { className: 'ns-section-heading ns-section-heading--airy' }, [
        h('div', {}, [
          h('p', { className: 'ns-eyebrow', text: isAuthenticated ? 'More scenes' : 'Start here' }),
          h('h2', { text: isAuthenticated ? 'Scenes on deck' : 'First scenes' }),
        ]),
        statusPill(orderedScenes.length ? 'Catalog loaded' : STATUS_COPY.empty),
      ]),
      orderedScenes.length
        ? catalogScenes.length
          ? h('div', { className: 'ns-scene-grid ns-scene-grid--catalog' }, catalogScenes.map((scene) => renderSceneCard({ scene, entrySource: 'home' })))
          : card({
              title: 'Current scene only',
              body: starterScene
                ? 'The recommended scene is the only visible scene right now.'
                : 'More scenes will appear when the catalog expands.',
              className: 'ns-support-card',
              children: starterScene
                ? [
                    buttonLink({
                      href: sceneHref(starterScene.id, { from: 'home' }),
                      text: getSignedInPrimaryCtaLabel({ recommendedScene: starterScene, latestTake }),
                      variant: 'secondary',
                    }),
                  ]
                : [],
            })
        : card({
            title: 'Scenes are warming up',
            body: 'The scene catalog is not available yet. Try again shortly.',
            className: 'ns-support-card',
          }),
    ]),
    h('div', { className: 'ns-grid ns-grid--two ns-support-grid' }, [
      leaderboard.rows.length
        ? renderLeaderboardPanel({ leaderboard, entrySource: 'leaderboard' })
        : card({
            title: 'No leaderboard scores yet',
            body: 'Submit a scored take to create the first benchmark.',
            className: 'ns-support-card',
          }),
      card({
        title: isAuthenticated ? 'Home summary' : 'The loop',
        body: isAuthenticated
          ? 'Home shows the recommended scene, daily status, and progress summary in one place.'
          : 'Open a scene, review the line, sign in to record a scored take, then choose what to practice next.',
        className: 'ns-support-card',
      }),
    ]),
  ]);
}
