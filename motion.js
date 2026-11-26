/* Framer Motion layer: everything that moves in the page itself (the 3D world lives in app.js).
Uses the browser build of the framer-motion package, which exposes window.Motion. */
const M = window.Motion;
const root = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const late = !root.classList.contains('m');   /* the safety timer in the page head already showed everything */
const EASE = [0.16, 1, 0.3, 1];
const SNAP = { type: 'spring', stiffness: 520, damping: 30 };
const SOFT = { type: 'spring', stiffness: 260, damping: 20 };
clearTimeout(window.__mT);
/* Whatever goes wrong, the content must end up visible. */
function showAll() {
root.classList.remove('m');
$$('[data-m]').forEach(el => { el.setAttribute('data-in', ''); el.style.opacity = ''; });
}
function attempt(fn) { try { fn(); } catch (e) { if (window.console) console.warn('motion:', e); } }
if (!M || calm || !('IntersectionObserver' in window)) {
showAll();
} else {
root.classList.add('fm');
attempt(orbit);
try { reveals(); } catch (e) { showAll(); }
attempt(progress);
attempt(gestures);
attempt(feedback);
}
/* ---------- Entrances: the first screen plays as one sequence, the rest arrives as it scrolls into view ---------- */
function reveals() {
const all = $$('[data-m]:not([data-in])');
let targets = all;
if (late) {
/* Content is already on screen: only arm what is still below the fold. */
targets = all.filter(el => el.getBoundingClientRect().top > window.innerHeight);
all.forEach(el => { if (targets.indexOf(el) < 0) el.setAttribute('data-in', ''); });
root.classList.add('m');
}
const queue = [];
let armed = false;
const flush = () => {
armed = false;
queue.splice(0)
.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
.forEach((el, i) => play(el, 0.04 + Math.min(i, 8) * 0.09));
};
/* Everything that enters in the same moment is staggered in reading order. */
const enqueue = el => {
if (el.hasAttribute('data-in') || queue.indexOf(el) >= 0) return;
queue.push(el);
if (!armed) { armed = true; Promise.resolve().then(flush); }
};
M.inView(targets, enqueue, { margin: '0px 0px -6% 0px' });
/* Watchdog: anything on screen that the observer somehow missed is brought in anyway. */
setInterval(() => {
if (document.hidden) return;
$$('[data-m]:not([data-in])').forEach(el => {
const r = el.getBoundingClientRect();
if (r.width && r.bottom > 0 && r.top < window.innerHeight * 0.9) enqueue(el);
});
}, 2500);
}
function play(el, delay) {
const kind = el.dataset.m;
el.style.opacity = '0';
el.setAttribute('data-in', '');
if (kind === 'line') { line(el, delay); return; }
if (kind === 'card') { M.animate(el, { opacity: [0, 1], y: [48, 0], scale: [0.96, 1] }, { delay, type: 'spring', visualDuration: 0.8, bounce: 0.16 }); return; }
if (kind === 'fade') { M.animate(el, { opacity: [0, 1] }, { delay, duration: 1.3, ease: 'easeOut' }); return; }
M.animate(el, { opacity: [0, 1], transform: ['translateY(28px)', 'translateY(0px)'] }, { delay, duration: 1, ease: EASE })
.then(() => { el.style.transform = ''; });
}
/* Big type rises from behind an invisible edge. The wrapper only exists while the line is moving. */
function line(el, delay) {
const inner = document.createElement('span');
inner.className = 'm-line';
while (el.firstChild) inner.appendChild(el.firstChild);
el.appendChild(inner);
inner.style.transform = 'translateY(135%)';
el.style.clipPath = 'inset(-0.14em -0.6em -0.3em -0.6em)';
el.style.opacity = '';
M.animate(inner, { transform: ['translateY(135%)', 'translateY(0%)'] }, { delay, duration: 1.2, ease: EASE }).then(() => {
if (inner.parentNode === el) {
while (inner.firstChild) el.insertBefore(inner.firstChild, inner);
el.removeChild(inner);
}
el.style.clipPath = '';
});
}
/* ---------- Scroll progress: a hairline under the header, driven by the page scroll ---------- */
function progress() {
const bar = document.createElement('div');
bar.className = 'progress';
bar.setAttribute('aria-hidden', 'true');
$('.site-header').appendChild(bar);
M.scroll(M.animate(bar, { transform: ['scaleX(0)', 'scaleX(1)'] }, { ease: 'linear' }));
}
/* ---------- Hover and press: springs on everything you can click ---------- */
function gestures() {
const pills = '.btn, .model-btn';
M.hover(pills, el => {
if (el.disabled) return;
M.animate(el, { y: -2 }, SNAP);
return () => M.animate(el, { y: 0 }, SOFT);
});
M.press(pills + ', .lang button', el => {
if (el.disabled) return;
M.animate(el, { scale: 0.95 }, SNAP);
return () => M.animate(el, { scale: 1 }, SOFT);
});
M.hover('.btn, a.card, .text-link', el => {
const arrow = $('i', el);
if (!arrow) return;
M.animate(arrow, { x: 4 }, SNAP);
return () => M.animate(arrow, { x: 0 }, SOFT);
});
/* Cards lift only in the plain grid; in the orbit their position belongs to the scroll. */
const grid = () => !root.classList.contains('orbit');
M.hover('a.card', el => {
if (!grid()) return;
M.animate(el, { y: -6 }, SOFT);
return () => { if (grid()) M.animate(el, { y: 0 }, SOFT); };
});
M.press('a.card', el => {
if (!grid()) return;
M.animate(el, { scale: 0.985 }, SNAP);
return () => { if (grid()) M.animate(el, { scale: 1 }, SOFT); };
});
}
/* ---------- Small answers to what the visitor just did ---------- */
function feedback() {
const pop = (el, from) => M.animate(el, { opacity: [0, 1], transform: ['translateY(' + from + ')', 'translateY(0px)'] }, { duration: 0.45, ease: EASE });
/* The HUD label changes when a model is picked. */
const label = $('#model-name');
if (label && 'MutationObserver' in window) {
new MutationObserver(() => pop(label, '8px')).observe(label, { childList: true, characterData: true, subtree: true });
}
/* Mobile menu: links drop in one after another. */
const header = $('.site-header');
const menuBtn = $('.menu-btn');
if (menuBtn) {
menuBtn.addEventListener('click', () => {
if (!header.classList.contains('open')) return;
M.animate('.nav a', { opacity: [0, 1], transform: ['translateY(-10px)', 'translateY(0px)'] }, { duration: 0.4, ease: EASE, delay: M.stagger(0.055) })
.then(() => $$('.nav a').forEach(a => { a.style.transform = ''; a.style.opacity = ''; }));
});
}
/* Contact form: fields that need fixing shake once; the confirmation slides in. */
const form = $('#contact-form');
const done = $('#form-done');
if (form && done) {
form.addEventListener('submit', () => {
$$('label.invalid', form).forEach(l => M.animate(l, { transform: ['translateX(0px)', 'translateX(-7px)', 'translateX(6px)', 'translateX(-3px)', 'translateX(0px)'] }, { duration: 0.42, ease: 'easeOut' }).then(() => { l.style.transform = ''; }));
});
if ('MutationObserver' in window) {
new MutationObserver(() => {
const shown = done.hidden ? form : done;
M.animate([...shown.children].filter(c => !c.hidden), { opacity: [0, 1], transform: ['translateY(14px)', 'translateY(0px)'] }, { duration: 0.5, ease: EASE, delay: M.stagger(0.05) })
.then(() => [...shown.children].forEach(c => { c.style.transform = ''; c.style.opacity = ''; }));
}).observe(done, { attributes: true, attributeFilter: ['hidden'] });
}
}
}
/* ---------- Gallery: project cards as glass panels orbiting the sculpture, turned by the scroll ---------- */
function orbit() {
const sec = $('#gallery');
const pin = sec && $('.pin', sec);
const origin = sec && $('.cards', sec);
const cards = origin ? $$('.card', origin) : [];
const count = $('#orbit-n');
if (!pin || cards.length < 2) return;
const N = cards.length;
const STEP = 52;                                  /* degrees between neighbouring cards */
const head = parseFloat(getComputedStyle(root).getPropertyValue('--head')) || 68;
const state = { u: 0, step: STEP * Math.PI / 180 };   /* shared with the 3D world so the sphere turns with the cards */
const rawU = M.motionValue(0);
const rawIn = M.motionValue(0);
const spring = { stiffness: 150, damping: 28, mass: 0.7 };
const u = M.springValue(rawU, spring);
const arrive = M.springValue(rawIn, spring);
let on = false;
let stops = [];
let shown = -1;
let fit = 1;
/* Glass: frosted only while a card rests level in front (browsers skip the blur on tilted panels anyway,
and it keeps scrolling cheap); a moving card is simply darker. The change is eased so it reads as a focus pull. */
const frost = getComputedStyle(root).getPropertyValue('--frost').trim() || 'blur(18px)';
const glass = (card, level) => {
if (card.__level === level) return;
card.__level = level;
const lite = root.classList.contains('lite');
const blur = level && !lite ? frost : 'blur(0px) saturate(1)';
card.style.webkitBackdropFilter = lite ? '' : blur;
card.style.backdropFilter = lite ? '' : blur;
card.style.background = level || lite ? '' : 'rgba(13,16,21,.87)';
};
/* Scroll position to card position: each card rests in front for a while before the next one swings in. */
const hold = x => {
const k = Math.min(N - 1, Math.floor(x));
const e = Math.min(1, Math.max(0, (x - k - 0.16) / 0.68));
return k + e * e * (3 - 2 * e);
};
const fade = k => (k <= 8 ? 1 : k <= 52 ? 1 - 0.58 * (k - 8) / 44 : k < 96 ? 0.42 * (1 - (k - 52) / 44) : 0);
const feed = (raw, smooth, map) => {
let first = true;
return p => {
const v = map(p);
raw.set(v);
if (first) { first = false; smooth.jump(v); }
};
};
function draw() {
if (!on) return;
const pos = u.get();
const q = Math.min(1, Math.max(0, arrive.get()));
state.u = pos;
const wide = window.innerWidth >= 900;
const R = wide ? cards[0].offsetWidth * 1.13 : Math.min(340, window.innerWidth * 0.86);
const P = wide ? 1200 : 900;
const rise = wide ? 84 : 64;
cards.forEach((card, i) => {
let a = (i - pos) * STEP + (1 - q) * 46;
if (Math.abs(a) < 0.5) a = 0;               /* dead level once it is as good as settled, so the glass renders at its cleanest */
const k = Math.abs(a);
const o = fade(k) * q;
card.style.transform = 'translate(-50%,-50%) perspective(' + P + 'px) translate3d(0,' + ((i - pos) * rise + (1 - q) * 90).toFixed(1) + 'px,' + -R + 'px) rotateY(' + a.toFixed(2) + 'deg) translateZ(' + R + 'px) scale(' + fit.toFixed(3) + ')';
card.style.opacity = o.toFixed(3);
card.style.zIndex = String(200 - Math.round(k));
card.style.pointerEvents = k < 75 ? 'auto' : 'none';
glass(card, a === 0);
});
const front = Math.max(0, Math.min(N - 1, Math.round(pos)));
if (front !== shown && count) {
const first = shown < 0;
shown = front;
count.textContent = (front < 9 ? '0' : '') + (front + 1);
if (!first) M.animate(count, { opacity: [0, 1], transform: ['translateY(70%)', 'translateY(0%)'] }, { duration: 0.45, ease: EASE });
}
}
function goTo(i) {
const top = sec.getBoundingClientRect().top + window.scrollY - head;
const range = sec.offsetHeight - pin.offsetHeight;
window.scrollTo({ top: top + (0.04 + 0.9 * i / (N - 1)) * range, behavior: 'smooth' });
}
function layout() {
const want = window.innerHeight - head >= 500;
if (want !== on) {
on = want;
root.classList.toggle('orbit', on);
stops.forEach(stop => stop());
stops = [];
if (on) {
cards.forEach(c => { c.setAttribute('data-in', ''); c.style.transition = 'backdrop-filter .5s ease, -webkit-backdrop-filter .5s ease, background-color .5s ease, border-color .35s'; });
window.__orbit = state;
stops.push(M.scroll(feed(rawU, u, p => hold(Math.min(1, Math.max(0, (p - 0.04) / 0.9)) * (N - 1))), { target: sec, offset: ['start ' + head + 'px', 'end end'] }));
stops.push(M.scroll(feed(rawIn, arrive, p => p), { target: sec, offset: ['start end', 'start ' + head + 'px'] }));
} else {
window.__orbit = null;
cards.forEach(c => { c.style.transform = ''; c.style.opacity = ''; c.style.zIndex = ''; c.style.pointerEvents = ''; c.style.transition = ''; c.style.webkitBackdropFilter = ''; c.style.backdropFilter = ''; c.style.background = ''; c.__level = undefined; });
}
}
origin.style.removeProperty('--ch');
origin.style.top = '';
if (!on) return;
const tallest = Math.max.apply(null, cards.map(c => c.offsetHeight));
origin.style.setProperty('--ch', tallest + 'px');
/* Room for the front card: the whole pin on wide screens; between the heading and the counter on narrow ones. */
const box = pin.getBoundingClientRect();
let top = 26;
let bottom = box.height - 26;
if (window.innerWidth < 900) {
top = $('.section-head', sec).getBoundingClientRect().bottom - box.top + 16;
if (count) bottom = count.parentNode.getBoundingClientRect().top - box.top - 14;
origin.style.top = ((top + bottom) / 2).toFixed(1) + 'px';
}
fit = Math.min(1, Math.max(0.6, (bottom - top) / tallest));
draw();
if (window.__stage3d) window.__stage3d.measure();   /* the 3D world sizes the sphere from this layout */
}
u.on('change', draw);
arrive.on('change', draw);
/* A card that is not in front comes to the front when clicked or focused, instead of opening. */
origin.addEventListener('click', ev => {
const i = cards.indexOf(ev.target.closest('.card'));
if (on && i >= 0 && Math.abs(i - u.get()) > 0.4) { ev.preventDefault(); goTo(i); }
});
origin.addEventListener('focusin', ev => {
const i = cards.indexOf(ev.target.closest('.card'));
if (on && i >= 0 && Math.abs(i - rawU.get()) > 0.4) goTo(i);
});
let pending = 0;
const relayout = () => { clearTimeout(pending); pending = setTimeout(layout, 120); };
window.addEventListener('resize', relayout);
$$('.lang button').forEach(b => b.addEventListener('click', relayout));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
layout();
}