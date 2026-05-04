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
          text: 'Save scores, streaks, unlock state, and challenge context to your account.',
        }),
      ]),
      statusPill(appState.session.status),
    ]),
    renderSessionPrompt({
      session: appState.session,
      title: 'Save your practice to Mirror',
      body: 'Sign in to keep scores, streaks, unlock state, and challenge context attached to your account.',
      onLogout: actions.session?.logoutWithLegacy,
    }),
    renderAuthFormShell({ session: appState.session, actions, redirectPath }),
    h('div', { className: 'ns-grid ns-grid--two' }, [
      card({
        title: 'Why sign in',
        body: 'Signing in lets Mirror save scores, streaks, unlock state, personal bests, and challenge context.',
      }),
      card({
        title: 'After sign-in',
        body: redirectPath
          ? `After sign-in, Mirror returns to ${redirectPath}.`
          : 'After sign-in, open a scene, daily, or progress from the new shell.',
      }),
    ]),
  ]);
}
