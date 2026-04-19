import { h } from '../lib/helpers/dom.js';
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

export function renderSessionPrompt({
  session,
  title = 'Sign in to Mirror',
  body = 'Sign in to sync progress, streaks, unlocks, and personalized scene data.',
  onLogout,
} = {}) {
  const isAuthenticated = session?.status === 'authenticated';
  const isError = session?.status === 'error';
  let action = buttonLink({ href: createAppHref('/auth'), text: 'Sign in', variant: 'secondary' });

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
    ? 'Progress, streaks, unlocks, and personal bests are active for this browser session.'
    : isError
      ? session.error?.message || 'Mirror could not refresh your session.'
      : body;

  return card({
    title: promptTitle,
    body: promptBody,
    className: `ns-session-card${isAuthenticated ? ' is-authenticated' : ' is-guest'}`,
    children: [
      h('div', { className: 'ns-inline-list' }, [
        statusPill(isAuthenticated ? 'Session active' : session?.status || 'Guest'),
        session?.hasToken ? statusPill('Saved session') : statusPill('Local only'),
        session?.error?.rateLimited ? statusPill('Rate limited') : null,
        action,
      ]),
    ],
  });
}
