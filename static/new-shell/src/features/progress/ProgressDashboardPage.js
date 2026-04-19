import { renderErrorState, renderLoadingState } from '../../components/AsyncState.js';
import { renderProgressStatCard } from '../../components/ProgressStatCard.js';
import { card, statusPill } from '../../components/primitives.js';
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

export function renderProgressDashboardPage({ appState }) {
  const page = h('div', {}, [renderLoadingState('Loading progress dashboard')]);

  loadProgressViewModel(appState)
    .then((viewModel) => {
      page.replaceChildren(renderProgressSurface(viewModel));
    })
    .catch((error) => {
      page.replaceChildren(renderErrorState(error, { title: 'Progress dashboard needs sign-in' }));
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
  return h('article', { className: 'ns-page' }, [
    h('header', { className: 'ns-page__header' }, [
      h('div', {}, [
        h('p', { className: 'ns-eyebrow', text: 'Progress' }),
        h('h2', { text: 'Progress dashboard' }),
        h('p', {
          className: 'ns-page__summary',
          text: `${profile.displayName} is in ${profile.division} with ${profile.points.toLocaleString()} points.`,
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
        body: 'Best-scoring scenes from your saved progress data.',
        children: [
          personalBests.length
            ? h('ul', {}, personalBests.map((best) => h('li', { text: `${best.sceneTitle} - ${best.score}` })))
            : h('p', { className: 'ns-muted', text: 'Submit a scored take to fill this list.' }),
        ],
      }),
      card({
        title: 'Recent history',
        body: 'Recent scored takes from your saved history.',
        children: [
          recentHistory.length
            ? h('ul', {}, recentHistory.map((item) => h('li', { text: `${item.sceneTitle}: ${item.score} (${item.result})` })))
            : h('p', { className: 'ns-muted', text: 'Recent scores will appear after scored submissions.' }),
        ],
      }),
      card({
        title: 'Focus areas',
        body: 'Patterns from recent scored takes, shaped into simple practice focus.',
        children: [
          h('ul', {}, focusAreas.map((area) => h('li', { text: area }))),
        ],
      }),
    ]),
    card({
      title: 'Progress sync',
      body: 'Personal bests, recent history, profile points, and focus areas refresh from your saved scoring data.',
    }),
  ]);
}
