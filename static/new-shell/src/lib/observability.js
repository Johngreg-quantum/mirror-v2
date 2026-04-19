const ANALYTICS_QUEUE_KEY = '__MIRROR_ANALYTICS__';
const ERROR_QUEUE_KEY = '__MIRROR_ERRORS__';
const MAX_QUEUE_SIZE = 100;
let globalCaptureInitialized = false;
let activeContextGetter = () => ({});

function nowIso() {
  return new Date().toISOString();
}

function trimQueue(queue) {
  if (queue.length > MAX_QUEUE_SIZE) {
    queue.splice(0, queue.length - MAX_QUEUE_SIZE);
  }
}

function getWindowQueue(key) {
  window[key] = Array.isArray(window[key]) ? window[key] : [];
  return window[key];
}

export function initObservabilityQueues() {
  getWindowQueue(ANALYTICS_QUEUE_KEY);
  getWindowQueue(ERROR_QUEUE_KEY);
}

function serializeError(error) {
  if (!error) {
    return {
      name: 'UnknownError',
      message: 'Unknown error',
    };
  }

  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    status: error.status || 0,
    authRequired: Boolean(error.authRequired),
    rateLimited: Boolean(error.rateLimited),
    retryAfterMs: error.retryAfterMs ?? null,
    attempts: error.attempts ?? null,
    stack: error.stack || '',
  };
}

export function getFailureKind(error) {
  if (error?.rateLimited || error?.status === 429) {
    return 'rate-limited';
  }

  if (error?.authRequired || error?.status === 401) {
    return 'auth-expired';
  }

  if (!error?.status) {
    return 'network-or-runtime';
  }

  return 'request-failed';
}

export function trackEvent(name, context = {}) {
  const event = {
    name,
    context,
    timestamp: nowIso(),
  };
  const queue = getWindowQueue(ANALYTICS_QUEUE_KEY);

  queue.push(event);
  trimQueue(queue);
  window.dispatchEvent(new CustomEvent('mirror:analytics', { detail: event }));

  return event;
}

export function logFrontendError(error, context = {}) {
  const record = {
    label: 'Mirror frontend error',
    error: serializeError(error),
    context: {
      failureKind: getFailureKind(error),
      ...context,
    },
    timestamp: nowIso(),
  };
  const queue = getWindowQueue(ERROR_QUEUE_KEY);

  queue.push(record);
  trimQueue(queue);

  if (window.console?.error) {
    window.console.error('[Mirror frontend]', record);
  }

  window.dispatchEvent(new CustomEvent('mirror:error', { detail: record }));

  return record;
}

export function logApiFailure(error, context = {}) {
  const failureKind = getFailureKind(error);

  if (failureKind === 'rate-limited' || failureKind === 'auth-expired') {
    logFrontendError(error, {
      surface: 'api',
      ...context,
      failureKind,
    });
  }
}

export function initGlobalErrorCapture({ getContext = () => ({}) } = {}) {
  initObservabilityQueues();

  activeContextGetter = getContext;

  if (globalCaptureInitialized) {
    return;
  }

  globalCaptureInitialized = true;

  window.addEventListener('error', (event) => {
    logFrontendError(event.error || new Error(event.message), {
      phase: 'window-error',
      filename: event.filename || '',
      line: event.lineno || 0,
      column: event.colno || 0,
      ...activeContextGetter(),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason || 'Unhandled promise rejection'));

    logFrontendError(reason, {
      phase: 'unhandled-rejection',
      ...activeContextGetter(),
    });
  });
}
