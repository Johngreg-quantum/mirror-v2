import { renderLoggedErrorState, renderLoadingState } from '../../components/AsyncState.js';
import { renderChallengeResultCard } from '../../components/ChallengeResultCard.js';
import { getSessionStatusPillLabel, renderSessionPrompt } from '../../components/SessionState.js';
import { buttonLink, card, statusPill } from '../../components/primitives.js';
import { CTA_COPY, STATUS_COPY } from '../../lib/copy/ux-copy.js';
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
      title: 'Challenge backup',
      body: 'Open the previous challenge view if this invite cannot load here.',
      children: [
        buttonLink({
          href: `/legacy/challenge/${encodeURIComponent(challengeId)}`,
          text: 'Open previous challenge view',
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
      h('h3', { text: `${challengeEntry.challengerName} set a target score` }),
      h('p', { text: `${challengeEntry.sceneTitle} from ${challengeEntry.film}. Record a take and compare scores.` }),
    ]),
    h('div', { className: 'ns-challenge-entry__benchmark' }, [
      h('span', { text: 'Score to beat' }),
      h('strong', { text: challengeEntry.targetScoreLabel }),
    ]),
    h('div', { className: 'ns-inline-list' }, [
      statusPill(challengeEntry.createdLabel),
      statusPill(isAuthenticated ? 'Ready to record' : STATUS_COPY.authRequired),
    ]),
    h('div', { className: 'ns-action-row' }, [
      buttonLink({
        href: primaryHref,
        text: isAuthenticated ? 'Open challenge scene' : 'Sign in to continue',
      }),
      isAuthenticated
        ? null
        : buttonLink({
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
      body: 'Score a take from the linked scene to show the challenge result here.',
      className: 'ns-challenge-aftermath',
      children: [statusPill('Awaiting scored take')],
    });
  }

  return card({
    title: challengeResult.outcome === 'won' ? 'Challenge won' : 'Target missed',
    body: challengeResult.outcome === 'won'
      ? challengeResult.message
      : `${challengeResult.message} Repeat the scene if you want another comparison.`,
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
              text: 'Open the linked scene, record a take, and compare it with the target score.',
            }),
          ]),
          h('div', { className: 'ns-inline-list' }, [
            statusPill(getSessionStatusPillLabel(appState.session)),
            statusPill(challengeEntry.targetScoreLabel),
          ]),
        ]),
        renderSessionPrompt({
          session: appState.session,
          title: isAuthenticated
            ? `Signed in as ${appState.session.user?.displayName || 'performer'}`
            : 'Sign in to accept this challenge',
          body: isAuthenticated
            ? 'The scene opens with this challenge target attached.'
            : 'After sign-in, Mirror opens the challenge scene.',
          showAction: isAuthenticated,
        }),
        renderChallengeEntryCard({ challengeEntry, isAuthenticated }),
        h('div', { className: 'ns-grid ns-grid--two' }, [
          renderChallengeResultCard({ entry: challengeEntry, result: challengeResult }),
          renderChallengeResultSummary({ challengeResult }),
        ]),
        card({
          title: challengeResult ? 'Challenge actions' : 'Challenge scene',
          body: challengeResult
            ? 'Repeat the scene or view progress from here.'
            : 'Launch the linked scene with challenge context preserved.',
          className: 'ns-challenge-launch-card',
          children: [
            h('div', { className: 'ns-inline-list' }, [
              statusPill(challengeEntry.sceneTitle),
              statusPill(challengeResult ? 'Result saved' : 'Challenge context'),
              buttonLink({
                href: challengeSceneHref,
                text: challengeResult ? CTA_COPY.repeatScene : 'Open challenge scene',
                variant: 'secondary',
              }),
              isAuthenticated
                ? buttonLink({
                    href: createAppHref('/progress'),
                    text: CTA_COPY.viewProgress,
                    variant: 'secondary',
                  })
                : null,
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
