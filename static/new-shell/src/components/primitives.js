import { h } from '../lib/helpers/dom.js';

export function card({ title, eyebrow, body, children = [], className = '' }) {
  const classes = `ns-card${className ? ` ${className}` : ''}`;

  return h('section', { className: classes }, [
    eyebrow ? h('p', { className: 'ns-eyebrow', text: eyebrow }) : null,
    h('h3', { text: title }),
    body ? h('p', { text: body }) : null,
    children,
  ]);
}

export function buttonLink({ href, text, variant = 'primary' }) {
  return h(
    'a',
    {
      className: `ns-button ns-button--${variant}`,
      href,
    },
    text,
  );
}

export function buttonShell({ text, variant = 'primary', disabled = true, type = 'button' }) {
  return h(
    'button',
    {
      className: `ns-button ns-button--${variant}`,
      disabled,
      type,
    },
    text,
  );
}

export function fieldShell({
  label,
  placeholder,
  type = 'text',
  disabled = true,
  name,
  autocomplete,
  required = false,
  minLength,
}) {
  return h('label', { className: 'ns-field' }, [
    h('span', { text: label }),
    h('input', {
      className: 'ns-input',
      placeholder,
      type,
      disabled,
      name,
      required,
      minLength,
      attrs: {
        autocomplete,
      },
    }),
  ]);
}

export function statusPill(text) {
  return h('span', { className: 'ns-pill', text });
}
