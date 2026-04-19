import { renderAuthFormShell } from '../../components/AuthFormShell.js';
import { renderSessionPrompt } from '../../components/SessionState.js';
import { card, statusPill } from '../../components/primitives.js';
import { h } from '../../lib/helpers/dom.js';

function normalizeRedirectPath(rawRedirect) {
  const redirectPath = String(rawRedirect || '').trim();

  if (!redirectPath.startsWith('/') || redirectPath.startsWith('//')) {
    return '';
  }

  return redirectPath;
}

export function renderAuthPage({ appState, actions, query = {} }) {
  const redirectPath = normalizeRedirectPath(query.redirect);

  return h('article', { className: 'ns-page' }, [
    h('header', { className: 'ns-page__header' }, [
      h('div', {}, [
        h('p', { className: 'ns-eyebrow', text: 'Account' }),
        h('h2', { text: 'Sign in' }),
        h('p', {
          className: 'ns-page__summary',
          text: 'Manage your Mirror session, then return to practice with progress and streak data synced.',
        }),
      ]),
      statusPill(appState.session.status),
    ]),
    renderSessionPrompt({
      session: appState.session,
      title: 'Account session',
      body: 'Sign in to unlock personalized progress, streaks, and challenge handoffs.',
      onLogout: actions.session?.logoutWithLegacy,
    }),
    renderAuthFormShell({ session: appState.session, actions, redirectPath }),
    h('div', { className: 'ns-grid ns-grid--two' }, [
      card({
        title: 'Session sync',
        body: 'Signing in unlocks progress, streak status, level availability, and challenge handoff data.',
      }),
      card({
        title: redirectPath ? 'Return path' : 'Ready for practice',
        body: redirectPath
          ? `After sign-in, Mirror returns you to ${redirectPath}.`
          : 'Choose a scene, accept a challenge, or check today\'s daily practice.',
      }),
    ]),
  ]);
}
