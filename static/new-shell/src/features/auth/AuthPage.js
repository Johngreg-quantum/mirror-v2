import { renderAuthFormShell } from '../../components/AuthFormShell.js';
import { getSessionStatusPillLabel, renderSessionPrompt } from '../../components/SessionState.js';
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
  const isAuthenticated = appState.session?.status === 'authenticated';

  return h('article', { className: 'ns-page' }, [
    h('header', { className: 'ns-page__header' }, [
      h('div', {}, [
        h('p', { className: 'ns-eyebrow', text: 'Account' }),
        h('h2', { text: isAuthenticated ? 'Account' : 'Sign in' }),
        h('p', {
          className: 'ns-page__summary',
          text: isAuthenticated
            ? 'Your scores, streaks, unlock state, personal bests, and challenge context are saved to this account.'
            : 'Save scores, streaks, unlock state, and challenge context to your account.',
        }),
      ]),
      statusPill(getSessionStatusPillLabel(appState.session)),
    ]),
    renderSessionPrompt({
      session: appState.session,
      title: 'Save your practice to Mirror',
      body: 'Sign in to keep scores, streaks, unlock state, and challenge context attached to your account.',
      showAction: false,
      onLogout: actions.session?.logoutWithLegacy,
    }),
    renderAuthFormShell({ session: appState.session, actions, redirectPath }),
    h('div', { className: 'ns-grid ns-grid--two' }, [
      card({
        title: isAuthenticated ? 'Saved to this account' : 'Why sign in',
        body: isAuthenticated
          ? 'Mirror uses this account for saved scores, streaks, unlock state, personal bests, and challenge context.'
          : 'Signing in lets Mirror save scores, streaks, unlock state, personal bests, and challenge context.',
      }),
      card({
        title: isAuthenticated ? 'Session controls' : 'After sign-in',
        body: isAuthenticated
          ? 'Use Sign out when this browser should stop using the saved account session.'
          : redirectPath
            ? `After sign-in, Mirror returns to ${redirectPath}.`
            : 'After sign-in, open a scene, daily, or progress from the new shell.',
      }),
    ]),
  ]);
}
