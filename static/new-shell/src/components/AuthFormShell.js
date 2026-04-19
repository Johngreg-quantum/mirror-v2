import { h } from '../lib/helpers/dom.js';
import { buttonShell, fieldShell, statusPill } from './primitives.js';

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
  const submitButton = buttonShell({ text: 'Sign in', disabled: false, type: 'submit' });
  submitButton.dataset.defaultText = 'Sign in';

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
          setMessage(messageEl, 'Email and password are required.');
          return;
        }

        setSubmitting(submitButton, 'Signing in...', true);

        try {
          await getSessionAction(actions, 'loginWithLegacy')({ email, password });
          setMessage(messageEl, 'Signed in and session refreshed.', 'success');
          form.reset();
          redirectAfterAuth(actions, redirectPath);
        } catch (error) {
          setMessage(messageEl, error.message || 'Login failed.');
        } finally {
          setSubmitting(submitButton, 'Signing in...', false);
        }
      },
    },
  }, [
    h('h3', { text: 'Sign in' }),
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
  const submitButton = buttonShell({ text: 'Create account', disabled: false, type: 'submit' });
  submitButton.dataset.defaultText = 'Create account';

  return h('form', {
    className: 'ns-auth-form',
    attrs: { 'aria-label': 'Create account' },
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
          setMessage(messageEl, 'Username, email, password, and confirmation are required.');
          return;
        }

        if (password !== confirmPassword) {
          setMessage(messageEl, 'Passwords do not match.');
          return;
        }

        setSubmitting(submitButton, 'Creating account...', true);

        try {
          await getSessionAction(actions, 'registerWithLegacy')({ username, email, password });
          setMessage(messageEl, 'Account created and session refreshed.', 'success');
          form.reset();
          redirectAfterAuth(actions, redirectPath);
        } catch (error) {
          setMessage(messageEl, error.message || 'Registration failed.');
        } finally {
          setSubmitting(submitButton, 'Creating account...', false);
        }
      },
    },
  }, [
    h('h3', { text: 'Create account' }),
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
      setMessage(messageEl, 'Signed out and session refreshed.', 'success');
    } catch (error) {
      setMessage(messageEl, error.message || 'Logout failed.');
    } finally {
      setSubmitting(logoutButton, 'Signing out...', false);
    }
  });

  return h('div', { className: 'ns-auth-form' }, [
    h('h3', { text: `Signed in as ${session.user?.displayName || 'performer'}` }),
    h('p', { text: 'Your session is verified and ready for personalized practice.' }),
    logoutButton,
    messageEl,
  ]);
}

export function renderAuthFormShell({ session, actions, redirectPath = '' }) {
  const isAuthenticated = session?.status === 'authenticated';

  return h('section', { className: 'ns-auth-panel' }, [
    h('div', { className: 'ns-auth-panel__copy' }, [
      h('p', { className: 'ns-eyebrow', text: 'Account' }),
      h('h2', { text: 'Practice picks up where you left off.' }),
      h('p', {
        text: 'Sign in or create an account to sync progress, streaks, unlocks, and challenge results.',
      }),
      h('div', { className: 'ns-inline-list' }, [
        statusPill('Sign in'),
        statusPill('Create account'),
        statusPill('Session refresh'),
      ]),
    ]),
    h('div', { className: 'ns-auth-actions' }, [
      isAuthenticated ? renderLogoutPanel({ actions, session }) : renderLoginForm({ actions, redirectPath }),
      isAuthenticated ? null : renderRegisterForm({ actions, redirectPath }),
    ]),
  ]);
}
