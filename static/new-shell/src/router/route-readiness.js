export const ROUTE_PROMOTION_STATUS = {
  PRIMARY: 'primary',
  FLAGGED: 'flagged',
  LEGACY_ONLY: 'legacy-only',
};

const ROUTE_READINESS_CONFIG = {
  home: {
    status: ROUTE_PROMOTION_STATUS.PRIMARY,
    enabled: true,
    navMode: 'primary',
    legacyPathTemplate: '/legacy',
  },
  auth: {
    status: ROUTE_PROMOTION_STATUS.PRIMARY,
    enabled: true,
    navMode: 'primary',
    legacyPathTemplate: '/legacy',
  },
  levels: {
    status: ROUTE_PROMOTION_STATUS.PRIMARY,
    enabled: true,
    navMode: 'primary',
    legacyPathTemplate: '/legacy',
  },
  'scene-detail': {
    status: ROUTE_PROMOTION_STATUS.PRIMARY,
    enabled: true,
    navMode: 'hidden',
    legacyPathTemplate: '/legacy',
    fallbackTitle: 'Previous scene flow is available',
    fallbackBody: 'Open the previous scene flow while this page is unavailable.',
    legacyActionText: 'Open previous scene flow',
  },
  progress: {
    status: ROUTE_PROMOTION_STATUS.PRIMARY,
    enabled: true,
    navMode: 'primary',
    legacyPathTemplate: '/legacy',
    fallbackTitle: 'Previous progress view is available',
    fallbackBody: 'Open the previous progress view while this page is unavailable.',
    legacyActionText: 'Open previous progress view',
  },
  daily: {
    status: ROUTE_PROMOTION_STATUS.PRIMARY,
    enabled: true,
    navMode: 'primary',
    legacyPathTemplate: '/legacy',
    fallbackTitle: 'Previous daily view is available',
    fallbackBody: 'Open the previous daily view while this page is unavailable.',
    legacyActionText: 'Open previous daily view',
  },
  challenge: {
    status: ROUTE_PROMOTION_STATUS.PRIMARY,
    enabled: true,
    navMode: 'hidden',
    legacyPathTemplate: '/legacy/challenge/:challengeId',
    fallbackTitle: 'Previous challenge view is available',
    fallbackBody: 'Open the previous challenge view for this invite while this page is unavailable.',
    legacyActionText: 'Open previous challenge view',
    navHref: '/legacy/challenge/sample-challenge',
  },
};

const DEFAULT_ROUTE_READINESS = {
  status: ROUTE_PROMOTION_STATUS.FLAGGED,
  enabled: false,
  navMode: 'hidden',
  legacyPathTemplate: '/legacy',
  fallbackTitle: 'Previous view is available',
  fallbackBody: 'This page is temporarily unavailable.',
  legacyActionText: 'Open previous view',
  navHref: '/legacy',
};

function fillPathTemplate(template, params = {}) {
  return String(template || '/').replace(/:([A-Za-z0-9_]+)/g, (_match, key) => (
    encodeURIComponent(String(params[key] || ''))
  ));
}

export function getRouteReadiness(routeId) {
  return {
    ...DEFAULT_ROUTE_READINESS,
    ...(ROUTE_READINESS_CONFIG[routeId] || {}),
  };
}

export function withRouteReadiness(route) {
  return {
    ...route,
    readiness: getRouteReadiness(route.id),
  };
}

export function isRouteEnabled(route) {
  const readiness = route.readiness || getRouteReadiness(route.id);

  return readiness.status === ROUTE_PROMOTION_STATUS.PRIMARY
    || (readiness.status === ROUTE_PROMOTION_STATUS.FLAGGED && readiness.enabled);
}

export function shouldShowRouteInNav(route) {
  if (!route.nav) {
    return false;
  }

  const readiness = route.readiness || getRouteReadiness(route.id);

  if (readiness.navMode === 'hidden') {
    return false;
  }

  if (readiness.status === ROUTE_PROMOTION_STATUS.LEGACY_ONLY) {
    return readiness.navMode === 'legacy-link';
  }

  if (readiness.status === ROUTE_PROMOTION_STATUS.FLAGGED && !readiness.enabled) {
    return false;
  }

  return true;
}

export function getRouteNavTag(route) {
  const readiness = route.readiness || getRouteReadiness(route.id);

  if (readiness.status === ROUTE_PROMOTION_STATUS.LEGACY_ONLY) {
    return 'legacy';
  }

  return '';
}

export function resolveLegacyRoutePath(route, { params = {} } = {}) {
  const readiness = route.readiness || getRouteReadiness(route.id);

  return fillPathTemplate(readiness.legacyPathTemplate, params);
}

export function getRouteFallbackConfig(route, { params = {} } = {}) {
  const readiness = route.readiness || getRouteReadiness(route.id);

  return {
    ...readiness,
    legacyPath: resolveLegacyRoutePath(route, { params }),
  };
}
