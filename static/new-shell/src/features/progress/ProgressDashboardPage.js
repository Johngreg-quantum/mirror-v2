import { renderLoggedErrorState, renderLoadingState } from '../../components/AsyncState.js';
import { renderProgressStatCard } from '../../components/ProgressStatCard.js';
import { buttonLink, card, statusPill } from '../../components/primitives.js';
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
        title: 'Progress dashboard needs sign-in',
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

function renderProgressSurface({ profile, progressSummary, personalBests, recentHistory, focusAreas }) {
  const hasPersonalBests = personalBests.length > 0;
  const hasRecentHistory = recentHistory.length > 0;

  return h('article', { className: 'ns-page' }, [
    h('header', { className: 'ns-page__header' }, [
      h('div', {}, [
        h('p', { className: 'ns-eyebrow', text: 'Progress' }),
        h('h2', { text: 'Progress dashboard' }),
        h('p', {
          className: 'ns-page__summary',
          text: hasRecentHistory
            ? `${profile.displayName} is in ${profile.division} with ${profile.points.toLocaleString()} points. Use the patterns below to choose the next take.`
            : `${profile.displayName} is in ${profile.division}. Your next scored take starts the visible progress trail.`,
        }),
      ]),
      statusPill('Synced'),
    ]),
    h('div', { className: 'ns-grid ns-grid--four' }, [
      renderProgressStatCard({ label: 'Average', value: progressSummary.scoreAverage, detail: 'all scored takes' }),
      renderProgressStatCard({ label: 'Scenes', value: progressSummary.scenesCompleted, detail: 'completed' }),
      renderProgressStatCard({ label: 'PBs', value: progressSummary.personalBests, detail: 'set so far' }),
      renderProgressStatCard({ label: 'Unlocked', value: progressSummary.unlockedScenes, detail: 'ready scenes' }),
    ]),
    h('div', { className: 'ns-grid ns-grid--three' }, [
      card({
        title: 'Personal bests',
        body: hasPersonalBests
          ? 'Best-scoring scenes from your saved progress data.'
          : 'Your first personal best appears after one scored scene. Start anywhere unlocked.',
        children: [
          hasPersonalBests
            ? h('ul', {}, personalBests.map((best) => h('li', { text: `${best.sceneTitle} - ${best.score}` })))
            : h('div', { className: 'ns-action-row' }, [
                buttonLink({ href: createAppHref('/'), text: 'Start a scene', variant: 'secondary' }),
                buttonLink({ href: createAppHref('/daily'), text: 'Try Daily', variant: 'secondary' }),
              ]),
        ],
      }),
      card({
        title: 'Recent history',
        body: hasRecentHistory
          ? 'Recent scored takes from your saved history.'
          : 'History becomes useful fast: one score gives you a baseline, the second gives you direction.',
        children: [
          hasRecentHistory
            ? h('ul', {}, recentHistory.map((item) => h('li', { text: `${item.sceneTitle}: ${item.score} (${item.result})` })))
            : h('p', { className: 'ns-muted', text: 'Record, analyze, and return here to see the practice trail.' }),
        ],
      }),
      card({
        title: 'Focus areas',
        body: hasRecentHistory
          ? 'Patterns from recent scored takes, shaped into simple practice focus.'
          : 'Once scores exist, this turns into the next thing to improve instead of an empty report.',
        children: [
          h('ul', {}, focusAreas.map((area) => h('li', { text: area }))),
        ],
      }),
    ]),
    card({
      title: hasRecentHistory ? 'Progress sync' : 'Why this matters',
      body: hasRecentHistory
        ? 'Personal bests, recent history, profile points, and focus areas refresh from your saved scoring data.'
        : 'Progress makes repeat practice feel concrete: baselines, personal bests, and focus prompts all begin with the first scored take.',
    }),
  ]);
}
