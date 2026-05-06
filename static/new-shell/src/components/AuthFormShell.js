import { h } from '../lib/helpers/dom.js';
import { CTA_COPY } from '../lib/copy/ux-copy.js';
import { buttonShell, fieldShell, statusPill } from './primitives.js';
import { getFailureKind, trackEvent } from '../lib/observability.js';

function setMessage(messageEl, message, type = 'error') {
  messageEl.textContent = message;
  messageEl.classList.toggle('ns-auth-message--error', type === 'error');
  messageEl.classList.toggle('ns-auth-message--success', type === 'success');
}

function setSubmitting(button, submittingText, isSubmitting) {
  button.disabled = isSubmitting;
  button.textContent = isSubmitting ? submittingText : button.dataset.defaultText;
}

function getFormValue(form, name) {
  return String(new FormData(form).get(name) || '').trim();
}

function getSessionAction(actions, actionName) {
  const action = actions?.session?.[actionName];

  if (!action) {
    throw new Error('Account actions are not available on this page.');
  }

  return action;
}

function redirectAfterAuth(actions, redirectPath) {
  if (!redirectPath) {
    return;
  }

  actions?.navigation?.go?.(redirectPath);
}

function renderLoginForm({ actions, redirectPath }) {
  const messageEl = h('p', {
    className: 'ns-auth-message',
    attrs: { 'aria-live': 'polite' },
  });
  const submitButton = buttonShell({ text: 'Sign in and continue', disabled: false, type: 'submit' });
  submitButton.dataset.defaultText = 'Sign in and continue';

  return h('form', {
    className: 'ns-auth-form',
    attrs: { 'aria-label': 'Sign in' },
    on: {
      submit: async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const email = getFormValue(form, 'email');
        const password = String(new FormData(form).get('password') || '');

        setMessage(messageEl, '');

        if (!email || !password) {
          trackEvent('auth_failure', {
            action: 'login',
            reason: 'validation',
          });
          setMessage(messageEl, 'Enter your email and password to continue.');
          return;
        }

        setSubmitting(submitButton, 'Signing in...', true);

        try {
          await getSessionAction(actions, 'loginWithLegacy')({ email, password });
          trackEvent('auth_success', {
            action: 'login',
            redirectPath: redirectPath || '',
          });
          setMessage(messageEl, 'Signed in. Loading saved practice.', 'success');
          form.reset();
          redirectAfterAuth(actions, redirectPath);
        } catch (error) {
          trackEvent('auth_failure', {
            action: 'login',
            status: error?.status || 0,
            failureKind: getFailureKind(error),
          });
          setMessage(messageEl, error.message || 'Sign-in failed.');
        } finally {
          setSubmitting(submitButton, 'Signing in...', false);
        }
      },
    },
  }, [
    h('h3', { text: 'Welcome back' }),
    h('p', { className: 'ns-muted', text: 'Use the account tied to your saved scores and streak.' }),
    fieldShell({
      label: 'Email',
      placeholder: 'maya@example.com',
      type: 'email',
      name: 'email',
      autocomplete: 'email',
      required: true,
      disabled: false,
    }),
    fieldShell({
      label: 'Password',
      placeholder: 'Password',
      type: 'password',
      name: 'password',
      autocomplete: 'current-password',
      required: true,
      disabled: false,
    }),
    submitButton,
    messageEl,
  ]);
}

function renderRegisterForm({ actions, redirectPath }) {
  const messageEl = h('p', {
    className: 'ns-auth-message',
    attrs: { 'aria-live': 'polite' },
  });
  const submitButton = buttonShell({ text: CTA_COPY.createAccount, disabled: false, type: 'submit' });
  submitButton.dataset.defaultText = CTA_COPY.createAccount;

  return h('form', {
    className: 'ns-auth-form',
    attrs: { 'aria-label': CTA_COPY.createAccount },
    on: {
      submit: async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const username = getFormValue(form, 'username');
        const email = getFormValue(form, 'email');
        const password = String(formData.get('password') || '');
        const confirmPassword = String(formData.get('confirmPassword') || '');

        setMessage(messageEl, '');

        if (!username || !email || !password || !confirmPassword) {
          trackEvent('auth_failure', {
            action: 'register',
            reason: 'validation',
          });
          setMessage(messageEl, 'Fill out username, email, and both password fields to create your account.');
          return;
        }

        if (password !== confirmPassword) {
          trackEvent('auth_failure', {
            action: 'register',
            reason: 'password-mismatch',
          });
          setMessage(messageEl, 'Passwords do not match.');
          return;
        }

        setSubmitting(submitButton, 'Creating account...', true);

        try {
          await getSessionAction(actions, 'registerWithLegacy')({ username, email, password });
          trackEvent('auth_success', {
            action: 'register',
            redirectPath: redirectPath || '',
          });
          setMessage(messageEl, 'Account created. Scores can now save to this account.', 'success');
          form.reset();
          redirectAfterAuth(actions, redirectPath);
        } catch (error) {
          trackEvent('auth_failure', {
            action: 'register',
            status: error?.status || 0,
            failureKind: getFailureKind(error),
          });
          setMessage(messageEl, error.message || 'Account creation failed.');
        } finally {
          setSubmitting(submitButton, 'Creating account...', false);
        }
      },
    },
  }, [
    h('h3', { text: 'Create your account' }),
    h('p', { className: 'ns-muted', text: 'Save scores, streaks, unlock state, and personal bests.' }),
    fieldShell({
      label: 'Username',
      placeholder: 'maya',
      name: 'username',
      autocomplete: 'username',
      required: true,
      minLength: 2,
      disabled: false,
    }),
    fieldShell({
      label: 'Email',
      placeholder: 'maya@example.com',
      type: 'email',
      name: 'email',
      autocomplete: 'email',
      required: true,
      disabled: false,
    }),
    fieldShell({
      label: 'Password',
      placeholder: 'At least 6 characters',
      type: 'password',
      name: 'password',
      autocomplete: 'new-password',
      required: true,
      minLength: 6,
      disabled: false,
    }),
    fieldShell({
      label: 'Confirm password',
      placeholder: 'Repeat password',
      type: 'password',
      name: 'confirmPassword',
      autocomplete: 'new-password',
      required: true,
      minLength: 6,
      disabled: false,
    }),
    submitButton,
    messageEl,
  ]);
}

function renderLogoutPanel({ actions, session }) {
  const messageEl = h('p', {
    className: 'ns-auth-message',
    attrs: { 'aria-live': 'polite' },
  });
  const logoutButton = buttonShell({ text: 'Sign out', variant: 'secondary', disabled: false });
  logoutButton.dataset.defaultText = 'Sign out';
  logoutButton.addEventListener('click', async () => {
    setMessage(messageEl, '');
    setSubmitting(logoutButton, 'Signing out...', true);

    try {
      await getSessionAction(actions, 'logoutWithLegacy')();
      setMessage(messageEl, 'Signed out.', 'success');
    } catch (error) {
      setMessage(messageEl, error.message || 'Logout failed.');
    } finally {
      setSubmitting(logoutButton, 'Signing out...', false);
    }
  });

  return h('div', { className: 'ns-auth-form' }, [
    h('h3', { text: `Signed in as ${session.user?.displayName || 'performer'}` }),
    h('p', { text: 'Your scores, streaks, unlock state, personal bests, and challenge context are saved to this account.' }),
    logoutButton,
    messageEl,
  ]);
}

export function renderAuthFormShell({ session, actions, redirectPath = '' }) {
  const isAuthenticated = session?.status === 'authenticated';

  return h('section', { className: 'ns-auth-panel' }, [
    h('div', { className: 'ns-auth-panel__copy' }, [
      h('p', { className: 'ns-eyebrow', text: 'Account' }),
      h('h2', { text: isAuthenticated ? 'Session active.' : 'Save this session.' }),
      h('p', {
        text: isAuthenticated
          ? 'This browser is signed in. Scores, streaks, unlock state, personal bests, and challenge context stay attached to this account.'
          : 'Sign in or create an account so scores, streaks, unlock state, and challenge context are saved.',
      }),
      h('div', { className: 'ns-inline-list' }, [
        statusPill(isAuthenticated ? 'Scores saved' : 'Save scores'),
        statusPill(isAuthenticated ? 'Streak saved' : 'Keep streak'),
        statusPill(isAuthenticated ? 'Session active' : 'Account session'),
      ]),
    ]),
    h('div', { className: 'ns-auth-actions' }, [
      isAuthenticated ? renderLogoutPanel({ actions, session }) : renderLoginForm({ actions, redirectPath }),
      isAuthenticated ? null : renderRegisterForm({ actions, redirectPath }),
    ]),
  ]);
}
