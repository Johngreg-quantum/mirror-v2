import { h } from '../lib/helpers/dom.js';
import { createAppHref } from '../lib/routing/navigation.js';
import { shouldShowRouteInNav, getRouteNavTag } from '../router/route-readiness.js';
import { getSessionLabel, renderSessionPrompt } from './SessionState.js';

export function createAppLayout({ routes, sessionActions = {} }) {
  const navLinks = new Map();
  const sessionSlot = h('div', { className: 'ns-shell__session' });
  const sessionBadge = h('span', {
    className: 'ns-pill ns-pill--accent',
    text: 'Checking session',
  });

  const nav = h(
    'nav',
    {
      className: 'ns-shell__nav',
      attrs: { 'aria-label': 'Primary navigation' },
    },
    routes
      .filter((route) => shouldShowRouteInNav(route))
      .map((route) => {
        const navTag = getRouteNavTag(route);
        const href = route.readiness?.navMode === 'legacy-link'
          ? (route.readiness?.navHref || '/')
          : createAppHref(route.navPath);
        const link = h(
          'a',
          {
            className: `ns-shell__nav-link${route.protectedRead ? ' is-protected-read' : ''}`,
            href,
            attrs: {
              'data-route-id': route.id,
              title: route.protectedRead
                ? 'Sign in to load this section'
                : route.label,
            },
          },
          [
            h('span', { text: route.label }),
            navTag ? h('small', { text: navTag }) : null,
            route.protectedRead ? h('small', { text: 'sign in' }) : null,
          ],
        );

        navLinks.set(route.id, link);
        return link;
      }),
  );

  const outlet = h('main', {
    className: 'ns-shell__content',
    attrs: {
      id: 'newShellOutlet',
      tabindex: '-1',
    },
  });

  const root = h('div', { className: 'ns-shell' }, [
    h('aside', { className: 'ns-shell__rail' }, [
      h('a', { className: 'ns-shell__brand', href: createAppHref('/') }, [
        h('span', { className: 'ns-shell__brand-mark', text: 'M' }),
        h('span', { className: 'ns-shell__brand-text', text: 'Mirror' }),
      ]),
      h('p', {
        className: 'ns-shell__tagline',
        text: 'Cinematic scene practice with score-backed progress.',
      }),
      sessionSlot,
      nav,
    ]),
    h('div', { className: 'ns-shell__main' }, [
      h('header', { className: 'ns-shell__topbar' }, [
        h('div', {}, [
          h('p', { className: 'ns-eyebrow', text: 'Mirror' }),
          h('h1', { className: 'ns-shell__title', text: 'Scene practice' }),
        ]),
        sessionBadge,
      ]),
      outlet,
    ]),
  ]);

  function setActiveRoute(routeId) {
    navLinks.forEach((link, linkRouteId) => {
      const isActive = linkRouteId === routeId;
      link.classList.toggle('is-active', isActive);
      link.setAttribute('aria-current', isActive ? 'page' : 'false');
    });

    outlet.focus({ preventScroll: true });
  }

  function setSession(session) {
    sessionBadge.textContent = getSessionLabel(session);
    sessionBadge.classList.toggle('ns-pill--accent', session?.status !== 'authenticated');
    sessionBadge.classList.toggle('ns-pill--success', session?.status === 'authenticated');
    sessionSlot.replaceChildren(renderSessionPrompt({
      session,
      onLogout: sessionActions.logoutWithLegacy,
    }));
    navLinks.forEach((link) => {
      if (!link.classList.contains('is-protected-read')) {
        return;
      }

      link.classList.toggle('needs-session', session?.status !== 'authenticated');
    });
  }

  return {
    root,
    outlet,
    setActiveRoute,
    setSession,
  };
}
