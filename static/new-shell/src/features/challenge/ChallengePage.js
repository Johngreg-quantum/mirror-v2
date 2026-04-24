import { renderLoggedErrorState, renderLoadingState } from '../../components/AsyncState.js';
import { renderChallengeResultCard } from '../../components/ChallengeResultCard.js';
import { renderSessionPrompt } from '../../components/SessionState.js';
import { buttonLink, card, statusPill } from '../../components/primitives.js';
import { h } from '../../lib/helpers/dom.js';
import { fetchChallengeEntry } from '../../lib/api/challenge.js';
import { adaptChallengeEntry, adaptChallengeResult } from '../../lib/adapters/challenge-adapter.js';
import { createAppHref } from '../../lib/routing/navigation.js';
import { scenePath } from '../../lib/routing/scene-routes.js';
import { trackEvent } from '../../lib/observability.js';
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

function renderChallengeRouteError(challengeId, error = null) {
  return h('article', { className: 'ns-page' }, [
    renderLoggedErrorState(error || new Error(`Challenge ${challengeId} could not load right now.`), {
      title: 'Challenge could not load',
      surface: 'challenge',
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
      h('h3', { text: `${challengeEntry.challengerName} put up a score to beat` }),
      h('p', { text: `${challengeEntry.sceneTitle} from ${challengeEntry.film}. Record one take, then see the head-to-head aftermath.` }),
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
        text: isAuthenticated ? 'Beat this score' : 'Sign in to accept',
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
      body: 'Your win/loss state, points, and streak signal appear here after the scored take returns.',
      className: 'ns-challenge-aftermath',
      children: [statusPill('Awaiting scored take')],
    });
  }

  return card({
    title: challengeResult.outcome === 'won' ? 'Win secured' : 'Rematch target',
    body: challengeResult.outcome === 'won'
      ? `${challengeResult.message} This is the emotional payoff moment: send the next benchmark or keep climbing.`
      : `${challengeResult.message} Try again from the same scene while the target is clear.`,
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

      trackEvent('challenge_opened', {
        challengeId: challengeEntry.id,
        sceneId: challengeEntry.sceneId,
        hasResult: Boolean(challengeResult),
      });

      if (challengeResult) {
        trackEvent('challenge_completed', {
          challengeId: challengeEntry.id,
          sceneId: challengeEntry.sceneId,
          outcome: challengeResult.outcome,
          yourScore: challengeResult.yourScore,
          opponentScore: challengeResult.opponentScore,
        });
      }

      page.replaceChildren(h('article', { className: 'ns-page' }, [
        h('header', { className: 'ns-page__header' }, [
          h('div', {}, [
            h('p', { className: 'ns-eyebrow', text: 'Challenge' }),
            h('h2', { text: `Beat ${challengeEntry.targetScoreLabel}` }),
            h('p', {
              className: 'ns-page__summary',
              text: 'Open the scene with challenge context, record a take, and find out immediately whether you cleared the benchmark.',
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
            ? 'Launching this challenge preserves the benchmark through the scene, score, and aftermath.'
            : 'After sign-in, Mirror sends you into the challenge scene to record your take.',
        }),
        renderChallengeEntryCard({ challengeEntry, isAuthenticated }),
        h('div', { className: 'ns-grid ns-grid--two' }, [
          renderChallengeResultCard({ entry: challengeEntry, result: challengeResult }),
          renderChallengeResultSummary({ challengeResult }),
        ]),
        card({
          title: challengeResult ? 'Keep the challenge moving' : 'Challenge scene launch',
          body: challengeResult
            ? 'Retry the scene, send the next benchmark through the real challenge flow when sharing is available, or jump back to progress.'
            : 'Launch the linked scene with challenge context preserved.',
          className: 'ns-challenge-launch-card',
          children: [
            h('div', { className: 'ns-inline-list' }, [
              statusPill(challengeEntry.sceneTitle),
              statusPill(challengeResult ? 'Share-worthy result' : 'Challenge context saved'),
              buttonLink({
                href: challengeSceneHref,
                text: challengeResult ? 'Try again' : 'Open challenge scene',
                variant: 'secondary',
              }),
              buttonLink({
                href: createAppHref('/progress'),
                text: 'Open Progress',
                variant: 'secondary',
              }),
            ]),
          ],
        }),
      ]));
    })
    .catch((error) => {
      page.replaceChildren(renderChallengeRouteError(challengeId, error));
    });

  return page;
}
