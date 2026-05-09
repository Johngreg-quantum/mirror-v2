import { h } from '../lib/helpers/dom.js';
import { CTA_COPY } from '../lib/copy/ux-copy.js';
import { createAppHref } from '../lib/routing/navigation.js';
import { buttonLink, card, statusPill } from './primitives.js';

export function getSessionLabel(session) {
  if (session?.status === 'authenticated') {
    return session.user?.displayName || 'Signed in';
  }

  if (session?.status === 'loading' || session?.status === 'unknown') {
    return 'Checking session';
  }

  if (session?.status === 'error') {
    return 'Session check failed';
  }

  return 'Guest mode';
}

export function getSessionStatusPillLabel(session) {
  if (session?.status === 'authenticated') {
    return 'Session active';
  }

  if (session?.status === 'loading' || session?.status === 'unknown') {
    return 'Checking session';
  }

  if (session?.status === 'error') {
    return 'Session issue';
  }

  return 'Guest mode';
}

function getSessionStoragePillLabel(session) {
  if (session?.hasToken) {
    return 'Saved session';
  }

  if (session?.status === 'authenticated') {
    return 'Account session';
  }

  return 'No account yet';
}

export function renderSessionPrompt({
  session,
  title = 'Sign in to keep your practice',
  body = 'Sign in to save scores, streaks, unlock state, and challenge context.',
  actionHref = createAppHref('/auth'),
  actionText = CTA_COPY.signInToSaveProgress,
  showAction = true,
  onLogout,
} = {}) {
  const isAuthenticated = session?.status === 'authenticated';
  const isError = session?.status === 'error';
  let action = showAction ? buttonLink({ href: actionHref, text: actionText, variant: 'secondary' }) : null;

  if (isAuthenticated) {
    action = onLogout
      ? h('button', {
          className: 'ns-button ns-button--secondary',
          type: 'button',
          on: {
            click: async (event) => {
              const button = event.currentTarget;
              button.disabled = true;
              button.textContent = 'Signing out...';
              try {
                await onLogout();
              } finally {
                button.disabled = false;
                button.textContent = 'Sign out';
              }
            },
          },
          text: 'Sign out',
        })
      : null;
  }

  const promptTitle = isAuthenticated
    ? `Signed in as ${getSessionLabel(session)}`
    : isError ? 'Session refresh failed' : title;
  const promptBody = isAuthenticated
    ? 'Scores, streaks, unlock state, personal bests, and challenge context are attached to this account session.'
    : isError
      ? session.error?.message || 'Mirror could not refresh your session.'
      : body;

  return card({
    title: promptTitle,
    body: promptBody,
    className: `ns-session-card${isAuthenticated ? ' is-authenticated' : ' is-guest'}`,
    children: [
      h('div', { className: 'ns-inline-list' }, [
        statusPill(getSessionStatusPillLabel(session)),
        statusPill(getSessionStoragePillLabel(session)),
        session?.error?.rateLimited ? statusPill('Rate limited') : null,
        action,
      ]),
    ],
  });
}
