import { renderErrorState, renderLoadingState } from '../../components/AsyncState.js';
import { renderChallengeResultCard } from '../../components/ChallengeResultCard.js';
import { renderSessionPrompt } from '../../components/SessionState.js';
import { buttonLink, card, statusPill } from '../../components/primitives.js';
import { h } from '../../lib/helpers/dom.js';
import { fetchChallengeEntry } from '../../lib/api/challenge.js';
import { adaptChallengeEntry, adaptChallengeResult } from '../../lib/adapters/challenge-adapter.js';
import { createAppHref } from '../../lib/routing/navigation.js';
import { scenePath } from '../../lib/routing/scene-routes.js';
import { getStoredChallengeEntry, getStoredChallengeResult, storeChallengeEntry } from '../../state/app-state.js';

function buildChallengeScenePath(challengeEntry) {
  return scenePath(challengeEntry.sceneId, {
    from: 'challenge',
    challengeId: challengeEntry.id,
  });
}

function buildChallengeAuthPath(challengeEntry) {
  const challengeScenePath = buildChallengeScenePath(challengeEntry);
  return createAppHref(`/auth?redirect=${encodeURIComponent(challengeScenePath)}`);
}

async function loadChallengeViewModel(appState, challengeId) {
  const storedResult = getStoredChallengeResult(appState, challengeId);
  const cachedEntry = getStoredChallengeEntry(appState, challengeId)?.raw
    || storedResult?.challengeEntry
    || null;
  const rawChallenge = cachedEntry || await fetchChallengeEntry(challengeId);
  storeChallengeEntry(appState, challengeId, rawChallenge);

  const challengeEntry = adaptChallengeEntry(rawChallenge);
  const challengeResult = adaptChallengeResult({
    challengeEntry,
    analyzeResult: storedResult?.analyzeResult || null,
  });

  return {
    challengeEntry,
    challengeResult,
    storedResult,
  };
}

function renderChallengeRouteError(challengeId) {
  return h('article', { className: 'ns-page' }, [
    renderErrorState(new Error(`Challenge ${challengeId} could not load right now.`), {
      title: 'Challenge could not load',
    }),
    card({
      title: 'Rollback',
      body: 'Use the rollback challenge link while this invite is being checked.',
      children: [
        buttonLink({
          href: `/legacy/challenge/${encodeURIComponent(challengeId)}`,
          text: 'Open rollback challenge',
          variant: 'secondary',
        }),
      ],
    }),
  ]);
}

function renderChallengeEntryCard({ challengeEntry, isAuthenticated }) {
  const primaryHref = isAuthenticated
    ? createAppHref(buildChallengeScenePath(challengeEntry))
    : buildChallengeAuthPath(challengeEntry);

  return h('section', { className: 'ns-challenge-entry ns-challenge-entry--hero' }, [
    h('div', { className: 'ns-challenge-entry__copy' }, [
      h('p', { className: 'ns-eyebrow', text: 'Incoming challenge' }),
      h('h3', { text: `${challengeEntry.challengerName} challenged you` }),
      h('p', { text: `${challengeEntry.sceneTitle} from ${challengeEntry.film}` }),
    ]),
    h('div', { className: 'ns-challenge-entry__benchmark' }, [
      h('span', { text: 'Score to beat' }),
      h('strong', { text: challengeEntry.targetScoreLabel }),
    ]),
    h('div', { className: 'ns-inline-list' }, [
      statusPill(challengeEntry.createdLabel),
      statusPill(isAuthenticated ? 'Ready to record' : 'Sign-in handoff'),
    ]),
    h('div', { className: 'ns-action-row' }, [
      buttonLink({
        href: primaryHref,
        text: isAuthenticated ? 'Accept challenge' : 'Sign in to accept',
      }),
      buttonLink({
        href: createAppHref(buildChallengeScenePath(challengeEntry)),
        text: 'Open challenge scene',
        variant: 'secondary',
      }),
    ]),
  ]);
}

function renderChallengeResultSummary({ challengeResult }) {
  if (!challengeResult) {
    return card({
      title: 'Challenge aftermath',
      body: 'Your result appears here after the scored take returns.',
      className: 'ns-challenge-aftermath',
      children: [statusPill('Awaiting scored take')],
    });
  }

  return card({
    title: 'Challenge aftermath',
    body: challengeResult.message,
    className: `ns-challenge-aftermath ns-challenge-aftermath--${challengeResult.outcome === 'won' ? 'win' : 'loss'}`,
    children: [
      h('div', { className: 'ns-inline-list' }, [
        statusPill(challengeResult.comparisonLabel),
        statusPill(`${challengeResult.pointsEarned} points`),
        statusPill(challengeResult.streakLabel),
      ]),
    ],
  });
}

export function renderChallengePage({ appState, params }) {
  const challengeId = params.challengeId || 'pending';
  const page = h('div', {}, [renderLoadingState('Loading challenge')]);

  loadChallengeViewModel(appState, challengeId)
    .then(({ challengeEntry, challengeResult }) => {
      const isAuthenticated = appState.session.status === 'authenticated';
      const challengeSceneHref = createAppHref(buildChallengeScenePath(challengeEntry));

      page.replaceChildren(h('article', { className: 'ns-page' }, [
        h('header', { className: 'ns-page__header' }, [
          h('div', {}, [
            h('p', { className: 'ns-eyebrow', text: 'Challenge' }),
            h('h2', { text: `Challenge ${challengeEntry.id}` }),
            h('p', {
              className: 'ns-page__summary',
              text: 'Review the invite, launch the scene, and compare your scored take against the benchmark.',
            }),
          ]),
          h('div', { className: 'ns-inline-list' }, [
            statusPill(appState.session.status),
            statusPill(challengeEntry.targetScoreLabel),
          ]),
        ]),
        renderSessionPrompt({
          session: appState.session,
          title: isAuthenticated
            ? `Signed in as ${appState.session.user?.displayName || 'performer'}`
            : 'Sign in to accept this challenge',
          body: isAuthenticated
            ? 'Accepting this challenge launches the linked scene with challenge context preserved.'
            : 'After sign-in, Mirror sends you into the challenge scene to record your take.',
        }),
        renderChallengeEntryCard({ challengeEntry, isAuthenticated }),
        h('div', { className: 'ns-grid ns-grid--two' }, [
          renderChallengeResultCard({ entry: challengeEntry, result: challengeResult }),
          renderChallengeResultSummary({ challengeResult }),
        ]),
        card({
          title: 'Challenge scene launch',
          body: 'Launch the linked scene with challenge context preserved.',
          className: 'ns-challenge-launch-card',
          children: [
            h('div', { className: 'ns-inline-list' }, [
              statusPill(challengeEntry.sceneTitle),
              statusPill('Challenge context saved'),
              buttonLink({
                href: challengeSceneHref,
                text: 'Open challenge scene',
                variant: 'secondary',
              }),
            ]),
          ],
        }),
      ]));
    })
    .catch(() => {
      page.replaceChildren(renderChallengeRouteError(challengeId));
    });

  return page;
}
