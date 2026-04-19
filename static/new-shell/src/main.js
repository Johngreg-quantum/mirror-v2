import { createAppShell } from './app-shell.js';
import { initGlobalErrorCapture } from './lib/observability.js';

initGlobalErrorCapture({
  getContext: () => ({
    phase: 'app-boot',
    path: window.location.pathname,
    hash: window.location.hash,
  }),
});

const root = document.querySelector('#newShellRoot');

if (!root) {
  throw new Error('Mirror app root was not found.');
}

createAppShell({ root });
