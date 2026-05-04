import { renderErrorState, renderLoggedErrorState, renderLoadingState } from '../../components/AsyncState.js';
import { renderLeaderboardPanel } from '../../components/LeaderboardPanel.js';
import { createSceneDetailPanel, getRuntimeDisabledReason } from '../../components/SceneDetailPanel.js';
import { renderScorePanelShell } from '../../components/ScorePanelShell.js';
import { buttonLink, card, statusPill } from '../../components/primitives.js';
import { CTA_COPY, SECTION_COPY, STATUS_COPY, STATE_COPY } from '../../lib/copy/ux-copy.js';
import { h } from '../../lib/helpers/dom.js';
import { fetchChallengeEntry } from '../../lib/api/challenge.js';
import { getFreshPostScoreReadCache } from '../../lib/api/post-score-refresh.js';
import {
  fetchDailyChallenge,
  fetchLeaderboard,
  fetchProfile,
  fetchProgress,
  fetchSceneConfig,
} from '../../lib/api/read-data.js';
import { adaptChallengeEntry, adaptChallengeResult } from '../../lib/adapters/challenge-adapter.js';
import { adaptLeaderboard } from '../../lib/adapters/leaderboard-adapter.js';
import { adaptProfile } from '../../lib/adapters/progress-adapter.js';
import { adaptSceneConfig, findSceneById } from '../../lib/adapters/scene-adapter.js';
import { createAppHref } from '../../lib/routing/navigation.js';
import { getSceneBackHref, getSceneEntryLabel, sceneHref } from '../../lib/routing/scene-routes.js';
import { trackEvent } from '../../lib/observability.js';
import {
  getStoredChallengeEntry,
  getStoredChallengeResult,
  storeChallengeEntry,
  storeChallengeResult,
} from '../../state/app-state.js';
import { createAnalyzeStore } from './runtime/analyze-store.js';
import { createPostScoreRefreshStore } from './runtime/post-score-refresh-store.js';
import { createSceneRuntimeStore } from './runtime/scene-runtime-store.js';

function buildSceneDetailViewModel({
  sceneId,
  rawSceneConfig,
  rawDaily,
  rawLeaderboard,
  rawProgress = null,
  rawProfile = null,
  progressError = null,
  profileError = null,
  rawChallenge = null,
  challengeResultRecord = null,
  challengeError = null,
}) {
  const { scenes } = adaptSceneConfig(rawSceneConfig, {
    progress: rawProgress,
    daily: rawDaily,
  });
  const scene = findSceneById(scenes, sceneId);

  return {
    scene,
    scenes,
    daily: rawDaily,
    challengeEntry: adaptChallengeEntry(rawChallenge),
    challengeResult: adaptChallengeResult({
      challengeEntry: adaptChallengeEntry(rawChallenge),
      analyzeResult: challengeResultRecord?.analyzeResult || null,
    }),
    challengeError,
    challengeResultRecord,
    profile: adaptProfile(rawProfile),
    progressError,
    profileError,
    leaderboard: adaptLeaderboard(rawLeaderboard, scenes, scene?.id),
    rawChallenge,
    rawSceneConfig,
    rawDaily,
    rawLeaderboard,
    rawProgress,
    rawProfile,
  };
}

export function renderSceneDetailPage({ appState, params, query = {}, onCleanup, actions }) {
  const sceneId = params.sceneId || 'pending';
  const page = h('div', {}, [renderLoadingState('Loading scene detail')]);

  loadSceneDetailViewModel(sceneId, appState, query)
    .then((viewModel) => {
      page.replaceChildren(renderSceneDetailSurface({
        appState,
        sceneId,
        query,
        session: appState.session,
        onCleanup,
        actions,
        ...viewModel,
      }));
    })
    .catch((error) => {
      page.replaceChildren(renderLoggedErrorState(error, {
        title: 'Scene detail could not load',
        surface: 'scene-detail',
      }));
    });

  return page;
}

async function loadSceneDetailViewModel(sceneId, appState, query = {}) {
  const session = appState.session;
  const postScoreCache = getFreshPostScoreReadCache(appState);
  const [rawSceneConfig, rawDaily, rawLeaderboard] = await Promise.all([
    postScoreCache?.sceneConfig && !postScoreCache?.errors?.sceneConfig
      ? Promise.resolve(postScoreCache.sceneConfig)
      : fetchSceneConfig(),
    postScoreCache?.daily && !postScoreCache?.errors?.daily
      ? Promise.resolve(postScoreCache.daily)
      : fetchDailyChallenge(),
    postScoreCache?.leaderboard && !postScoreCache?.errors?.leaderboard
      ? Promise.resolve(postScoreCache.leaderboard)
      : fetchLeaderboard(),
  ]);
  let rawProgress = null;
  let rawProfile = null;
  let rawChallenge = null;
  let challengeResultRecord = null;
  let challengeError = null;
  let progressError = null;
  let profileError = null;

  if (query.from === 'challenge' && query.challengeId) {
    try {
      const cachedChallenge = getStoredChallengeEntry(appState, query.challengeId)?.raw || null;
      rawChallenge = cachedChallenge || await fetchChallengeEntry(query.challengeId);
      storeChallengeEntry(appState, query.challengeId, rawChallenge);
    } catch (error) {
      challengeError = error;
    }
    challengeResultRecord = getStoredChallengeResult(appState, query.challengeId);
    if (!rawChallenge && challengeResultRecord?.challengeEntry) {
      rawChallenge = challengeResultRecord.challengeEntry;
      challengeError = null;
    }
  }

  if (session?.status === 'authenticated') {
    const [progressResult, profileResult] = await Promise.allSettled([
      postScoreCache?.progress && !postScoreCache?.errors?.progress
        ? Promise.resolve(postScoreCache.progress)
        : fetchProgress(),
      postScoreCache?.profile && !postScoreCache?.errors?.profile
        ? Promise.resolve(postScoreCache.profile)
        : fetchProfile(),
    ]);

    if (progressResult.status === 'fulfilled') {
      rawProgress = progressResult.value;
    } else {
      progressError = progressResult.reason;
    }

    if (profileResult.status === 'fulfilled') {
      rawProfile = profileResult.value;
    } else {
      profileError = profileResult.reason;
    }
  }

  return buildSceneDetailViewModel({
    sceneId,
    rawSceneConfig,
    rawDaily,
    rawLeaderboard,
    rawProgress,
    rawProfile,
    progressError,
    profileError,
    rawChallenge,
    challengeResultRecord,
    challengeError,
  });
}

function renderMissingScene({ sceneId, scenes }) {
  return h('article', { className: 'ns-page ns-scene-page' }, [
    renderErrorState(new Error(`No scene exists for route id "${sceneId}".`), {
      title: 'Scene not found',
    }),
    card({
      title: 'Available scenes',
      body: scenes.length
        ? 'Choose a scene below to open its detail page.'
        : 'Scenes will appear here when the catalog is ready.',
      children: [
        scenes.length
          ? h('div', { className: 'ns-inline-list' }, scenes.slice(0, 8).map((item) => buttonLink({
              href: sceneHref(item.id, { from: 'home' }),
              text: item.title,
              variant: 'secondary',
            })))
          : buttonLink({ href: createAppHref('/'), text: CTA_COPY.backHome, variant: 'secondary' }),
      ],
    }),
  ]);
}

function getRefreshStatusLabel(snapshot) {
  if (snapshot.status === 'refreshing') {
    return 'Refreshing reads';
  }

  if (snapshot.status === 'success') {
    return 'Reads refreshed';
  }

  if (snapshot.status === 'degraded') {
    return 'Partial refresh';
  }

  return 'Current page';
}

function getAftermathTone(result) {
  const score = Number(result?.sync_score || 0);

  if (score >= 90 || result?.is_new_pb) {
    return 'breakthrough';
  }

  if (score >= 80) {
    return 'strong';
  }

  if (score >= 65) {
    return 'promising';
  }

  return 'early';
}

function buildSceneJourney(scene, scenes = []) {
  if (!scene) {
    return null;
  }

  const sameLevelScenes = scenes
    .filter((item) => item.level === scene.level)
    .sort((left, right) => left.levelSceneNumber - right.levelSceneNumber);
  const nextInLevel = sameLevelScenes.find((item) => item.levelSceneNumber === scene.levelSceneNumber + 1) || null;
  const nextUnlockedScene = findNextUnlockedScene(scene, scenes);

  return {
    label: `${scene.levelName} scene ${scene.levelSceneNumber} of ${scene.levelSceneCount}`,
    nextInLevel,
    nextUnlockedScene,
  };
}

function buildAftermathPlan({ result, scene, query, nextScene, daily }) {
  const score = Number(result?.sync_score || 0);
  const retryAction = {
    href: sceneHref(scene.id, query),
    text: CTA_COPY.repeatScene,
    rationale: 'Repeat this scene while the last take is directly comparable.',
  };
  const nextSceneAction = nextScene
    ? {
        href: sceneHref(nextScene.id, { from: 'home' }),
        text: CTA_COPY.openNextScene,
        rationale: nextScene.level === scene.level
          ? `Open ${nextScene.title}, the next scene in ${scene.levelName}.`
          : `Open ${nextScene.title}.`,
      }
    : null;
  const dailyAction = daily?.scene_id && daily.scene_id !== scene?.id
    ? {
        href: sceneHref(daily.scene_id, { from: 'daily' }),
        text: CTA_COPY.openDaily,
        rationale: 'Open today\'s daily scene from here.',
      }
    : null;
  const progressAction = {
    href: createAppHref('/progress'),
    text: CTA_COPY.viewProgress,
    rationale: 'See this saved score in context.',
  };
  const homeAction = {
    href: createAppHref('/'),
    text: CTA_COPY.backHome,
  };

  let primary = retryAction;

  if (score >= 85 || result?.is_new_pb) {
    primary = nextSceneAction || dailyAction || progressAction;
  } else if (score >= 70 && dailyAction) {
    primary = dailyAction;
  }

  const secondary = [retryAction, nextSceneAction, dailyAction, progressAction, homeAction]
    .filter(Boolean)
    .filter((action) => action.href !== primary.href || action.text !== primary.text);

  return { primary, secondary };
}

function getPendingAftermathCopy(snapshot) {
  if (snapshot?.status === 'submitting') {
    return {
      body: 'Scoring is in progress. The next action appears after the result returns.',
      pills: [STATUS_COPY.submitting],
    };
  }

  if (snapshot?.status === 'error') {
    return {
      body: snapshot.error?.message || 'Scoring did not finish. Use the score card to try again with this take.',
      pills: [snapshot.error?.authRequired ? STATUS_COPY.authRequired : STATUS_COPY.error],
    };
  }

  if (snapshot?.status === 'idle') {
    return {
      body: 'Score the recorded take; the next action will appear here.',
      pills: [STATUS_COPY.takeReady],
    };
  }

  if (snapshot?.disabledCode === 'auth-required') {
    return {
      body: 'Sign in before scoring. The next action appears after a saved score.',
      pills: [STATUS_COPY.authRequired],
    };
  }

  if (snapshot?.disabledCode === 'locked') {
    return {
      body: STATE_COPY.lockedRecordingAndScoring,
      pills: [STATUS_COPY.locked],
    };
  }

  return {
    body: 'Record and score a take; the next action will appear here.',
    pills: [STATUS_COPY.noScoresYet],
  };
}

function findNextUnlockedScene(scene, scenes = []) {
  if (!scene || !scenes.length) {
    return null;
  }

  const currentIndex = scenes.findIndex((item) => item.id === scene.id);
  const ordered = currentIndex >= 0
    ? scenes.slice(currentIndex + 1).concat(scenes.slice(0, currentIndex))
    : scenes;

  return ordered.find((item) => item.id !== scene.id && !item.locked)
    || ordered.find((item) => item.id !== scene.id)
    || null;
}

function renderSceneDailyStateCard({ scene, daily, profile, profileError, refreshSnapshot, session }) {
  const isDailyScene = scene.isDaily;
  const streakLabel = profile ? `${profile.streakDays}-day streak` : profileError ? 'Profile unavailable' : 'No profile';
  const dailyStatus = profileError
    ? STATUS_COPY.dailyStatusUnavailable
    : profile?.dailyStatus || (isDailyScene ? 'Sign in for daily status' : 'Daily elsewhere');
  const body = profileError
    ? profileError.message || 'Account daily status did not load. The public daily scene is still available.'
    : isDailyScene
    ? profile
      ? `${scene.title} is today's daily. Status: ${profile.dailyStatus}. Streak: ${profile.streakDays} days. Points: ${profile.points.toLocaleString()}.`
      : session?.status === 'authenticated'
        ? 'This is today\'s daily. Account daily status will appear when profile data is available.'
        : 'This is today\'s daily. Sign in to show account daily status.'
    : daily?.scene_id
      ? 'Today\'s daily is a different scene.'
      : 'Daily status appears when public scene data is available.';

  return card({
    title: SECTION_COPY.daily,
    body,
    className: 'ns-context-card ns-support-card',
    children: [
      h('div', { className: 'ns-inline-list' }, [
        statusPill(isDailyScene ? 'Daily scene' : 'Not daily'),
        statusPill(dailyStatus),
        statusPill(streakLabel),
        statusPill(getRefreshStatusLabel(refreshSnapshot)),
      ]),
      refreshSnapshot.status === 'degraded'
        ? h('p', {
            className: 'ns-muted',
            text: refreshSnapshot.error?.message || 'The score saved, but one related read did not refresh.',
          })
        : null,
    ],
  });
}

function renderPostScoreAftermathCard({
  analyzeSnapshot,
  refreshSnapshot,
  scene,
  scenes,
  daily,
  query,
  challengeEntry,
}) {
  const result = analyzeSnapshot.result;

  if (!result) {
    const pending = getPendingAftermathCopy(analyzeSnapshot);

    return card({
      title: SECTION_COPY.nextUp,
      body: pending.body,
      className: 'ns-aftermath-card',
      children: [
        h('div', { className: 'ns-inline-list' }, [
          statusPill('Scene'),
          statusPill('Record'),
          statusPill('Score'),
          ...pending.pills.map((pill) => statusPill(pill)),
          statusPill(getRefreshStatusLabel(refreshSnapshot)),
        ]),
      ],
    });
  }

  const nextScene = findNextUnlockedScene(scene, scenes);
  const score = Number(result.sync_score || 0);
  const tone = getAftermathTone(result);
  const plan = buildAftermathPlan({
    result,
    scene,
    query,
    nextScene,
    daily,
  });
  const children = [
    h('div', { className: 'ns-inline-list' }, [
      statusPill(getRefreshStatusLabel(refreshSnapshot)),
      statusPill(`+${Math.round(Number(result.points_earned || 0))} points`),
      statusPill(result.division?.name || 'Unranked'),
      result.is_new_pb ? statusPill('New PB') : statusPill('PB unchanged'),
      result.is_daily
        ? statusPill(result.daily_already_done ? 'Daily already completed' : 'Daily result reflected')
        : statusPill('Standard scene'),
    ]),
  ];

  if (refreshSnapshot.status === 'degraded') {
    children.push(h('p', {
      className: 'ns-muted',
      text: refreshSnapshot.error?.message || 'The score was saved, but some related views did not refresh yet.',
    }));
  } else if (refreshSnapshot.status === 'success') {
    children.push(h('p', {
      className: 'ns-muted',
      text: 'Related reads refreshed after the score saved.',
    }));
  }

  children.push(h('section', { className: 'ns-aftermath-card__cta' }, [
    h('div', { className: 'ns-aftermath-card__cta-copy' }, [
      h('p', { className: 'ns-eyebrow', text: SECTION_COPY.nextUp }),
      h('h3', { text: plan.primary.text }),
      h('p', { className: 'ns-muted', text: plan.primary.rationale }),
    ]),
    buttonLink({ href: plan.primary.href, text: plan.primary.text }),
  ]));

  if (plan.secondary.length) {
    children.push(h('div', { className: 'ns-action-row ns-action-row--card ns-aftermath-card__secondary' }, plan.secondary.map((action) => buttonLink({
      href: action.href,
      text: action.text,
      variant: 'secondary',
    }))));
  }

  return card({
    title: SECTION_COPY.nextUp,
    body: tone === 'breakthrough'
      ? `${STATE_COPY.scoreSaved}. The next scene is available.`
      : tone === 'strong'
        ? `${STATE_COPY.scoreSaved}. Open the next scene, or repeat while the take is directly comparable.`
        : tone === 'promising'
          ? `${STATE_COPY.scoreSaved}. One more pass gives the most direct comparison.`
          : `${STATE_COPY.scoreSaved} at ${Math.round(score)}. Repeating the scene gives the most direct next read.`,
    className: 'ns-aftermath-card ns-aftermath-card--scored',
    children,
  });
}

function mergeSceneDetailViewModel(currentViewModel, bundle, sceneId) {
  return buildSceneDetailViewModel({
    sceneId,
    rawSceneConfig: bundle.sceneConfig || currentViewModel.rawSceneConfig,
    rawDaily: bundle.daily || currentViewModel.rawDaily,
    rawLeaderboard: bundle.leaderboard || currentViewModel.rawLeaderboard,
    rawProgress: bundle.progress || currentViewModel.rawProgress,
    rawProfile: bundle.profile || currentViewModel.rawProfile,
    progressError: bundle.progress ? null : currentViewModel.progressError,
    profileError: bundle.profile ? null : currentViewModel.profileError,
    rawChallenge: currentViewModel.rawChallenge,
    challengeResultRecord: currentViewModel.challengeResultRecord,
    challengeError: currentViewModel.challengeError,
  });
}

function withChallengeResult(currentViewModel, appState, analyzeResult) {
  if (!currentViewModel.challengeEntry) {
    return currentViewModel;
  }

  const challengeResultRecord = storeChallengeResult(appState, {
    challengeId: currentViewModel.challengeEntry.id,
    challengeEntry: currentViewModel.rawChallenge,
    analyzeResult,
  });

  return buildSceneDetailViewModel({
    sceneId: currentViewModel.scene.id,
    rawSceneConfig: currentViewModel.rawSceneConfig,
    rawDaily: currentViewModel.rawDaily,
    rawLeaderboard: currentViewModel.rawLeaderboard,
    rawProgress: currentViewModel.rawProgress,
    rawProfile: currentViewModel.rawProfile,
    progressError: currentViewModel.progressError,
    profileError: currentViewModel.profileError,
    rawChallenge: currentViewModel.rawChallenge,
    challengeResultRecord,
    challengeError: currentViewModel.challengeError,
  });
}

function renderChallengeStateCard({ challengeId, challengeEntry, challengeResult, challengeError }) {
  if (!challengeEntry && challengeError) {
    return card({
      title: 'Challenge context unavailable',
      body: challengeError.message || 'Challenge details did not load for this scene.',
      className: 'ns-state-card ns-state-card--error',
      children: [
        h('div', { className: 'ns-inline-list' }, [
          statusPill('Partial state'),
          buttonLink({
            href: createAppHref(`/challenge/${encodeURIComponent(challengeId)}`),
            text: 'Open challenge',
            variant: 'secondary',
          }),
        ]),
      ],
    });
  }

  if (!challengeEntry) {
    return card({
      title: 'Challenge context unavailable',
      body: 'The scene is open, but challenge invite details are not available in this session.',
      className: 'ns-state-card ns-state-card--empty',
      children: [
        h('div', { className: 'ns-inline-list' }, [
          statusPill('Challenge context'),
          buttonLink({
            href: createAppHref(`/challenge/${encodeURIComponent(challengeId)}`),
            text: 'Open challenge',
            variant: 'secondary',
          }),
        ]),
      ],
    });
  }

  if (challengeResult) {
    return card({
      title: 'Challenge aftermath',
      body: challengeResult.message,
      className: `ns-challenge-aftermath ns-challenge-aftermath--${challengeResult.outcome === 'won' ? 'win' : 'loss'}`,
      children: [
        h('div', { className: 'ns-inline-list' }, [
          statusPill(challengeResult.comparisonLabel),
          statusPill(challengeResult.yourScore),
          statusPill(`Target ${challengeResult.opponentScore}`),
          challengeResult.isNewPersonalBest ? statusPill('New PB') : null,
          buttonLink({
            href: createAppHref(`/challenge/${encodeURIComponent(challengeEntry.id)}`),
            text: 'View challenge',
            variant: 'secondary',
          }),
        ]),
      ],
    });
  }

  return card({
    title: 'Challenge target',
    body: `${challengeEntry.challengerName} set ${challengeEntry.targetScoreLabel} on this scene. Submit a scored take to compare.`,
    className: 'ns-challenge-aftermath',
    children: [
      h('div', { className: 'ns-inline-list' }, [
        statusPill(challengeEntry.targetScoreLabel),
        statusPill(challengeEntry.createdLabel),
        buttonLink({
          href: createAppHref(`/challenge/${encodeURIComponent(challengeEntry.id)}`),
          text: 'Back to challenge',
          variant: 'secondary',
        }),
      ]),
    ],
  });
}

function renderSceneDetailSurface({
  appState,
  sceneId,
  query,
  session,
  onCleanup,
  actions,
  ...initialViewModel
}) {
  if (!initialViewModel.scene) {
    return renderMissingScene({ sceneId, scenes: initialViewModel.scenes });
  }

  let currentViewModel = initialViewModel;
  const challengeId = query.from === 'challenge' ? String(query.challengeId || '').trim() : '';
  const hasChallengeContext = Boolean(challengeId);
  const entryLabel = getSceneEntryLabel(query.from);
  let lastChallengeAnalyzeResult = currentViewModel.challengeResultRecord?.analyzeResult || null;
  const runtimeDisabledReason = getRuntimeDisabledReason({
    scene: currentViewModel.scene,
    session,
    progressError: currentViewModel.progressError,
  });
  const runtime = createSceneRuntimeStore({
    canRecord: !runtimeDisabledReason,
    disabledReason: runtimeDisabledReason,
  });
  const analyzeStore = createAnalyzeStore({
    runtime,
    sceneId: currentViewModel.scene.id,
    sessionStatus: session?.status,
    sceneLocked: currentViewModel.scene.locked,
    onAuthFailure: () => actions?.session?.refreshSession?.({ force: true }),
  });
  const postScoreRefreshStore = createPostScoreRefreshStore({
    analyzeStore,
    appState,
    sessionStatus: session?.status,
  });
  const sceneDetailPanel = createSceneDetailPanel({
    scene: currentViewModel.scene,
    journey: buildSceneJourney(currentViewModel.scene, currentViewModel.scenes),
    session,
    progressError: currentViewModel.progressError,
    runtime,
    analyzeStore,
    runtimeDisabledReason,
    onCleanup,
  });
  const leaderboardSlot = h('div');
  const dailyStateSlot = h('div');
  const aftermathSlot = h('div');
  const challengeSlot = h('div');

  function renderLeaderboardSlot() {
    leaderboardSlot.replaceChildren(
      currentViewModel.leaderboard.rows.length
        ? renderLeaderboardPanel({ leaderboard: currentViewModel.leaderboard, entrySource: 'leaderboard' })
        : card({
            title: 'Leaderboard is empty',
            body: 'This scene has no submitted scores yet.',
            className: 'ns-support-card',
            children: [statusPill(STATUS_COPY.noScoresYet)],
          }),
    );
  }

  function renderDailyStateSlot() {
    dailyStateSlot.replaceChildren(renderSceneDailyStateCard({
      scene: currentViewModel.scene,
      daily: currentViewModel.daily,
      profile: currentViewModel.profile,
      profileError: currentViewModel.profileError,
      refreshSnapshot: postScoreRefreshStore.getSnapshot(),
      session,
    }));
  }

  function renderAftermathSlot() {
    aftermathSlot.replaceChildren(renderPostScoreAftermathCard({
      analyzeSnapshot: analyzeStore.getSnapshot(),
      refreshSnapshot: postScoreRefreshStore.getSnapshot(),
      scene: currentViewModel.scene,
      scenes: currentViewModel.scenes,
      daily: currentViewModel.daily,
      query,
      challengeEntry: currentViewModel.challengeEntry,
    }));
  }

  function renderChallengeSlot() {
    if (!hasChallengeContext) {
      challengeSlot.replaceChildren();
      return;
    }

    challengeSlot.replaceChildren(renderChallengeStateCard({
      challengeId,
      challengeEntry: currentViewModel.challengeEntry,
      challengeResult: currentViewModel.challengeResult,
      challengeError: currentViewModel.challengeError,
    }));
  }

  const unsubscribeAnalyze = analyzeStore.subscribe((analyzeSnapshot) => {
    if (
      currentViewModel.challengeEntry
      && analyzeSnapshot.status === 'success'
      && analyzeSnapshot.result
      && analyzeSnapshot.result !== lastChallengeAnalyzeResult
    ) {
      lastChallengeAnalyzeResult = analyzeSnapshot.result;
      currentViewModel = withChallengeResult(currentViewModel, appState, analyzeSnapshot.result);
      trackEvent('challenge_completed', {
        challengeId: currentViewModel.challengeEntry.id,
        sceneId: currentViewModel.scene.id,
        outcome: currentViewModel.challengeResult?.outcome || '',
        yourScore: currentViewModel.challengeResult?.yourScore || '',
        opponentScore: currentViewModel.challengeResult?.opponentScore || '',
      });
      renderChallengeSlot();
    }

    renderAftermathSlot();
  });
  const unsubscribeRefresh = postScoreRefreshStore.subscribe((refreshSnapshot) => {
    if (refreshSnapshot.bundle) {
      currentViewModel = mergeSceneDetailViewModel(currentViewModel, refreshSnapshot.bundle, sceneId);
      sceneDetailPanel.update({
        scene: currentViewModel.scene,
        journey: buildSceneJourney(currentViewModel.scene, currentViewModel.scenes),
        progressError: currentViewModel.progressError,
      });
      renderLeaderboardSlot();
      renderDailyStateSlot();
    }

    renderAftermathSlot();
  });

  onCleanup?.(() => {
    unsubscribeAnalyze();
    unsubscribeRefresh();
    postScoreRefreshStore.cleanup();
    analyzeStore.cleanup();
    runtime.cleanup();
  });

  renderLeaderboardSlot();
  renderDailyStateSlot();
  renderAftermathSlot();
  renderChallengeSlot();
  const sceneJourney = buildSceneJourney(currentViewModel.scene, currentViewModel.scenes);

  return h('article', { className: 'ns-page ns-scene-page' }, [
    h('header', { className: 'ns-page__header ns-page__header--scene' }, [
      h('div', {}, [
        h('p', { className: 'ns-eyebrow', text: 'Scene detail' }),
        h('h2', { text: currentViewModel.scene.title }),
        h('p', {
          className: 'ns-page__summary',
          text: hasChallengeContext && currentViewModel.challengeEntry
            ? `Challenge target: ${currentViewModel.challengeEntry.targetScoreLabel}. Score a take to compare.`
            : hasChallengeContext
              ? 'Challenge details appear here when invite data is available.'
              : sceneJourney?.nextUnlockedScene
                ? `${sceneJourney.label}. Record, score, then choose whether to repeat or open ${sceneJourney.nextUnlockedScene.title}.`
                : `${sceneJourney?.label || currentViewModel.scene.levelName}. Record, score, then choose the next action.`,
        }),
      ]),
      h('div', { className: 'ns-inline-list ns-page__actions' }, [
        buttonLink({ href: getSceneBackHref(query), text: `Back to ${entryLabel}`, variant: 'secondary' }),
        buttonLink({ href: createAppHref('/'), text: 'Home', variant: 'secondary' }),
        statusPill(currentViewModel.scene.isDaily ? 'Daily scene' : 'Scene'),
        hasChallengeContext ? statusPill('Challenge context') : null,
      ]),
    ]),
    sceneDetailPanel.root,
    h('div', { className: 'ns-grid ns-grid--two ns-scene-results-grid' }, [
      renderScorePanelShell({
        title: SECTION_COPY.scorecard,
        score: '--',
        scoreLabel: 'waiting',
        detail: STATE_COPY.scoreDetailsAfterRecordedTake,
        analyzeStore,
        onCleanup,
      }),
      leaderboardSlot,
    ]),
    h('div', { className: 'ns-grid ns-grid--two ns-scene-context-grid' }, [
      aftermathSlot,
      hasChallengeContext ? challengeSlot : dailyStateSlot,
    ]),
    hasChallengeContext ? h('section', { className: 'ns-stack ns-scene-support-stack' }, [dailyStateSlot]) : null,
  ]);
}
