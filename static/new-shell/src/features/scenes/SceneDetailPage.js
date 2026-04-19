import { renderErrorState, renderLoadingState } from '../../components/AsyncState.js';
import { renderLeaderboardPanel } from '../../components/LeaderboardPanel.js';
import { createSceneDetailPanel, getRuntimeDisabledReason } from '../../components/SceneDetailPanel.js';
import { renderScorePanelShell } from '../../components/ScorePanelShell.js';
import { buttonLink, card, statusPill } from '../../components/primitives.js';
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
      page.replaceChildren(renderErrorState(error, { title: 'Scene detail could not load' }));
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
          : null,
      ],
    }),
  ]);
}

function getRefreshStatusLabel(snapshot) {
  if (snapshot.status === 'refreshing') {
    return 'Refreshing related reads';
  }

  if (snapshot.status === 'success') {
    return 'Related reads refreshed';
  }

  if (snapshot.status === 'degraded') {
    return 'Refresh partial';
  }

  return 'Current page';
}

function renderSceneDailyStateCard({ scene, daily, profile, profileError, refreshSnapshot }) {
  const isDailyScene = scene.isDaily;
  const streakLabel = profile ? `${profile.streakDays}-day streak` : 'Session auth';
  const dailyStatus = profile?.dailyStatus || (isDailyScene ? 'Auth needed for daily status' : 'Daily scene elsewhere');
  const body = isDailyScene
    ? profile
      ? `${scene.title} is today's scene. ${profile.dailyStatus}. ${profile.streakDays}-day streak and ${profile.points.toLocaleString()} total points are now reflected here.`
      : profileError?.message || 'This is the current daily scene. Sign in to show updated streak and completion status here.'
    : `The current daily scene is ${daily?.scene_id || 'unavailable'}; this is a regular scene entry.`;

  return card({
    title: 'Daily state',
    body,
    className: 'ns-context-card',
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
            text: refreshSnapshot.error?.message || 'Some related views are still catching up.',
          })
        : null,
    ],
  });
}

function renderPostScoreAftermathCard({ analyzeSnapshot, refreshSnapshot }) {
  const result = analyzeSnapshot.result;

  if (!result) {
    return card({
      title: 'Post-score aftermath',
      body: 'After a successful analyze, refreshed scene context appears here.',
      className: 'ns-aftermath-card',
      children: [statusPill(getRefreshStatusLabel(refreshSnapshot))],
    });
  }

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
      text: 'Progress, leaderboard, scene PB visibility, and daily/streak reads were refreshed from the server after this score.',
    }));
  }

  return card({
    title: 'Post-score aftermath',
    body: result.is_new_pb
      ? 'This take set a new personal best and the app is reflecting the server aftermath.'
      : 'This take was scored by the server and the app is reflecting the returned aftermath.',
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
      body: challengeError.message || 'The public challenge lookup did not load for this scene.',
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
    return null;
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
    title: 'Challenge benchmark',
    body: `${challengeEntry.challengerName} set ${challengeEntry.targetScoreLabel} on this scene. Submit a scored take to compare against that benchmark.`,
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
        : card({ title: 'Leaderboard is empty', body: 'This scene has no submitted scores yet.' }),
    );
  }

  function renderDailyStateSlot() {
    dailyStateSlot.replaceChildren(renderSceneDailyStateCard({
      scene: currentViewModel.scene,
      daily: currentViewModel.daily,
      profile: currentViewModel.profile,
      profileError: currentViewModel.profileError,
      refreshSnapshot: postScoreRefreshStore.getSnapshot(),
    }));
  }

  function renderAftermathSlot() {
    aftermathSlot.replaceChildren(renderPostScoreAftermathCard({
      analyzeSnapshot: analyzeStore.getSnapshot(),
      refreshSnapshot: postScoreRefreshStore.getSnapshot(),
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
      renderChallengeSlot();
    }

    renderAftermathSlot();
  });
  const unsubscribeRefresh = postScoreRefreshStore.subscribe((refreshSnapshot) => {
    if (refreshSnapshot.bundle) {
      currentViewModel = mergeSceneDetailViewModel(currentViewModel, refreshSnapshot.bundle, sceneId);
      sceneDetailPanel.update({
        scene: currentViewModel.scene,
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

  return h('article', { className: 'ns-page' }, [
    h('header', { className: 'ns-page__header' }, [
      h('div', {}, [
        h('p', { className: 'ns-eyebrow', text: 'Scene detail' }),
        h('h2', { text: currentViewModel.scene.title }),
        h('p', {
          className: 'ns-page__summary',
          text: hasChallengeContext && currentViewModel.challengeEntry
            ? `Challenge benchmark ${currentViewModel.challengeEntry.targetScoreLabel} is attached to this scene. Record, analyze, then compare the result.`
            : hasChallengeContext
              ? 'Challenge context is attached to this scene when invite data is available.'
              : 'Record a local take, submit it for scoring, and review the refreshed progress data here.',
        }),
      ]),
      h('div', { className: 'ns-inline-list' }, [
        buttonLink({ href: getSceneBackHref(query), text: `Back to ${entryLabel}`, variant: 'secondary' }),
        buttonLink({ href: createAppHref('/'), text: 'All scenes', variant: 'secondary' }),
        statusPill(currentViewModel.scene.isDaily ? 'Daily scene' : 'Scene'),
        hasChallengeContext ? statusPill('Challenge context') : null,
      ]),
    ]),
    sceneDetailPanel.root,
    h('div', { className: 'ns-grid ns-grid--two' }, [
      renderScorePanelShell({
        title: 'Analyze result',
        score: '--',
        scoreLabel: 'waiting',
        detail: 'Submit a recorded take to render the returned analyze result here.',
        analyzeStore,
        onCleanup,
      }),
      leaderboardSlot,
    ]),
    h('div', { className: 'ns-grid ns-grid--two' }, [
      aftermathSlot,
      hasChallengeContext ? challengeSlot : dailyStateSlot,
    ]),
    hasChallengeContext ? h('section', { className: 'ns-stack' }, [dailyStateSlot]) : null,
    card({
      title: 'After scoring',
      body: 'Progress, leaderboard, personal best, daily status, streak data, and challenge comparison refresh after a successful scored take.',
      className: 'ns-context-card',
    }),
  ]);
}
