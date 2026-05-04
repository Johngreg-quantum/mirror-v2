import { renderLoggedErrorState, renderLoadingState } from '../../components/AsyncState.js';
import { renderLevelSummaryCard } from '../../components/LevelSummaryCard.js';
import { renderProgressStatCard } from '../../components/ProgressStatCard.js';
import { card, statusPill } from '../../components/primitives.js';
import { h } from '../../lib/helpers/dom.js';
import { fetchProgress, fetchSceneConfig } from '../../lib/api/read-data.js';
import { adaptProgressSummary } from '../../lib/adapters/progress-adapter.js';
import { adaptSceneConfig } from '../../lib/adapters/scene-adapter.js';

export function renderLevelPanelPage() {
  const page = h('div', {}, [renderLoadingState('Loading levels')]);

  loadLevelViewModel()
    .then((viewModel) => {
      page.replaceChildren(renderLevelSurface(viewModel));
    })
    .catch((error) => {
      page.replaceChildren(renderLoggedErrorState(error, {
        title: 'Levels could not load',
        surface: 'levels',
      }));
    });

  return page;
}

async function loadLevelViewModel() {
  const [sceneConfig, progress] = await Promise.all([
    fetchSceneConfig(),
    fetchProgress(),
  ]);
  const { levels } = adaptSceneConfig(sceneConfig, { progress });
  const progressSummary = adaptProgressSummary({ progress, profile: null, history: null });

  return { levels, progressSummary };
}

function renderLevelSurface({ levels, progressSummary }) {
  return h('article', { className: 'ns-page' }, [
    h('header', { className: 'ns-page__header' }, [
      h('div', {}, [
        h('p', { className: 'ns-eyebrow', text: 'Levels' }),
        h('h2', { text: 'Levels' }),
        h('p', {
          className: 'ns-page__summary',
          text: 'Levels show which scenes are available and the score target for the next set.',
        }),
      ]),
      statusPill('Levels loaded'),
    ]),
    h('div', { className: 'ns-grid ns-grid--three' }, [
      renderProgressStatCard({ label: 'Unlocked', value: progressSummary.unlockedScenes, detail: 'scenes available' }),
      renderProgressStatCard({ label: 'Next target', value: progressSummary.nextUnlockScore || '--', detail: 'score to open more' }),
      renderProgressStatCard({ label: 'PBs', value: progressSummary.personalBests, detail: 'saved bests' }),
    ]),
    levels.length
      ? h('div', { className: 'ns-level-grid' }, levels.map((level) => renderLevelSummaryCard({ level })))
      : card({ title: 'No levels found', body: 'Levels will appear here when the catalog is ready.' }),
    card({
      title: 'How to move through it',
      body: 'Open the first available scene in the current level. Higher levels unlock from saved score targets.',
    }),
  ]);
}
