import { renderErrorState, renderLoadingState } from '../components/AsyncState.js';
import { buttonLink, card, statusPill } from '../components/primitives.js';
import { h, mount } from '../lib/helpers/dom.js';
import { getCurrentAppPath, getRoutingMode, navigateToAppPath } from '../lib/routing/navigation.js';
import { getRouteFallbackConfig, isRouteEnabled, ROUTE_PROMOTION_STATUS } from './route-readiness.js';
import { renderSessionPrompt } from '../components/SessionState.js';
import { logFrontendError, trackEvent } from '../lib/observability.js';

function normalizePath(path) {
  const cleanPath = path || '/';
  return cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
}

function splitPathAndQuery(path) {
  const [pathPart, queryPart = ''] = String(path || '/').split('?');
  return {
    path: normalizePath(pathPart),
    query: Object.fromEntries(new URLSearchParams(queryPart)),
  };
}

function matchRoute(routePath, currentPath) {
  const routeParts = normalizePath(routePath).split('/').filter(Boolean);
  const currentParts = normalizePath(currentPath).split('/').filter(Boolean);

  if (routeParts.length !== currentParts.length) {
    return null;
  }

  const params = {};

  for (let index = 0; index < routeParts.length; index += 1) {
    const routePart = routeParts[index];
    const currentPart = currentParts[index];

    if (routePart.startsWith(':')) {
      params[routePart.slice(1)] = decodeURIComponent(currentPart);
      continue;
    }

    if (routePart !== currentPart) {
      return null;
    }
  }

  return params;
}

function resolveRoute(routes, currentPath) {
  for (const route of routes) {
    const params = matchRoute(route.path, currentPath);

    if (params) {
      return { route, params };
    }
  }

  return { route: routes[0], params: {} };
}

function findMatchedRoute(routes, currentPath) {
  for (const route of routes) {
    const params = matchRoute(route.path, currentPath);

    if (params) {
      return { route, params };
    }
  }

  return null;
}

export function createRouter({ routes, outlet, appState, actions = {}, onRouteChange }) {
  let renderVersion = 0;
  let cleanupCallbacks = [];
  let lastViewedRouteKey = '';
  let lastLegacyFallbackKey = '';
  const routingMode = getRoutingMode();

  function runCleanup() {
    cleanupCallbacks.forEach((cleanup) => {
      try {
        cleanup();
      } catch (error) {
        logFrontendError(error, {
          phase: 'route-cleanup',
          surface: 'router',
        });
        // Route cleanup should not block the next render.
      }
    });
    cleanupCallbacks = [];
  }

  function renderProtectedReadState(route) {
    const session = appState.session;

    if (session.status === 'unknown' || session.status === 'loading') {
      return renderLoadingState(`Checking session for ${route.label}`);
    }

    if (session.status === 'error') {
      return renderErrorState(session.error, { title: `${route.label} session check failed` });
    }

    if (session.status !== 'authenticated') {
      return renderSessionPrompt({
        session,
        title: `${route.label} needs sign-in`,
        body: 'Sign in to load your saved progress here, then jump back in without losing the thread.',
        onLogout: actions.session?.logoutWithLegacy,
      });
    }

    return null;
  }

  function renderLegacyFallbackState(route, params) {
    const fallback = getRouteFallbackConfig(route, { params });
    const isLegacyOnly = fallback.status === ROUTE_PROMOTION_STATUS.LEGACY_ONLY;
    const routeStatusLabel = isLegacyOnly
      ? 'Previous view'
      : fallback.status === ROUTE_PROMOTION_STATUS.PRIMARY
        ? 'Previous path'
        : 'Unavailable';

    return h('article', { className: 'ns-page' }, [
      card({
        title: fallback.fallbackTitle,
        body: fallback.fallbackBody,
        children: [
          h('div', { className: 'ns-inline-list' }, [
            statusPill(routeStatusLabel),
            statusPill(route.label),
            statusPill(fallback.legacyPath),
            buttonLink({
              href: fallback.legacyPath,
              text: fallback.legacyActionText,
              variant: 'secondary',
            }),
          ]),
          h('p', {
            className: 'ns-muted',
            text: 'Use the previous view below if this page is temporarily unavailable.',
          }),
        ],
      }),
    ]);
  }

  function renderCurrentRoute() {
    runCleanup();
    renderVersion += 1;
    const currentRenderVersion = renderVersion;
    const currentPath = getCurrentAppPath();
    const { path, query } = splitPathAndQuery(currentPath);
    const { route, params } = resolveRoute(routes, path);
    const fallbackPage = isRouteEnabled(route) ? null : renderLegacyFallbackState(route, params);
    const blockedPage = fallbackPage || (route.protectedRead ? renderProtectedReadState(route) : null);
    const onCleanup = (cleanup) => {
      if (currentRenderVersion !== renderVersion) {
        try {
          cleanup();
        } catch (error) {
          logFrontendError(error, {
            phase: 'late-route-cleanup',
            surface: 'router',
          });
          // Late cleanup after a route change should stay isolated.
        }
        return;
      }

      cleanupCallbacks.push(cleanup);
    };
    let page = blockedPage;

    if (!page) {
      try {
        page = route.render({ appState, params, path, query, actions, onCleanup });
      } catch (error) {
        logFrontendError(error, {
          phase: 'route-render',
          surface: route.id,
          routeId: route.id,
          path,
        });
        page = renderErrorState(error, {
          title: `${route.label} could not render`,
        });
      }
    }

    try {
      mount(outlet, page);
    } catch (error) {
      logFrontendError(error, {
        phase: 'route-mount',
        surface: route.id,
        routeId: route.id,
        path,
      });
      mount(outlet, renderErrorState(error, {
        title: `${route.label} could not display`,
      }));
    }

    onRouteChange?.(route.id);

    const routeViewKey = `${route.id}:${currentPath}`;

    if (routeViewKey !== lastViewedRouteKey) {
      lastViewedRouteKey = routeViewKey;
      trackEvent('route_viewed', {
        routeId: route.id,
        path,
        query,
        params,
        blocked: Boolean(blockedPage),
        fallback: Boolean(fallbackPage),
      });
    }

    if (fallbackPage) {
      const fallbackKey = `${route.id}:${currentPath}`;

      if (fallbackKey !== lastLegacyFallbackKey) {
        lastLegacyFallbackKey = fallbackKey;
        trackEvent('legacy_fallback_route_opened', {
          routeId: route.id,
          path,
          params,
        });
      }
    }
  }

  function handleDocumentNavigation(event) {
    if (routingMode !== 'path') {
      return;
    }

    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) {
      return;
    }

    const anchor = event.target?.closest?.('a[href]');

    if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) {
      return;
    }

    const url = new URL(anchor.href, window.location.origin);

    if (url.origin !== window.location.origin) {
      return;
    }

    if (url.pathname === '/legacy' || url.pathname.startsWith('/legacy/')) {
      trackEvent('legacy_fallback_route_opened', {
        path: url.pathname,
        search: url.search || '',
        source: 'legacy-link',
      });
      return;
    }

    const matched = findMatchedRoute(routes, url.pathname);

    if (!matched) {
      return;
    }

    const { route } = matched;

    if (!route || route.readiness?.status === ROUTE_PROMOTION_STATUS.LEGACY_ONLY) {
      return;
    }

    event.preventDefault();
    navigateToAppPath(`${url.pathname}${url.search || ''}`);
    renderCurrentRoute();
  }

  window.addEventListener(routingMode === 'hash' ? 'hashchange' : 'popstate', renderCurrentRoute);

  if (routingMode === 'path') {
    document.addEventListener('click', handleDocumentNavigation);
  }

  return {
    start() {
      renderCurrentRoute();
    },
    go(path) {
      navigateToAppPath(path);
      renderCurrentRoute();
    },
    refresh() {
      renderCurrentRoute();
    },
  };
}
