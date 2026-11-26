/* Project covers that move: videos (Mirror, Vanragedon before, chambasuave) and the 3D glass (Vanragedon).
Everything loads when its card comes near, and only after the page itself (and the main 3D) has loaded.
With reduced motion or data saver on, only the still picture is shown. */
(function () {
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const thrifty = !!(navigator.connection && navigator.connection.saveData);
const still = calm || thrifty;
const afterLoad = fn => {
const idle = () => setTimeout(fn, 2500);
if (document.readyState === 'complete') idle(); else window.addEventListener('load', idle);
};
const whenNear = (els, fn) => afterLoad(() => {
if (!('IntersectionObserver' in window)) { els.forEach(fn); return; }
const near = new IntersectionObserver(list => list.forEach(e => {
if (e.isIntersecting) { fn(e.target); near.unobserve(e.target); }
}), { rootMargin: '600px 0px' });
els.forEach(el => near.observe(el));
});
/* ---------- Videos. Clips with a loop attribute play while their picture is on screen (half of it, or the share
in data-threshold) and pause otherwise. The others (Mirror) play once from the start each time the picture
becomes half visible, and again on hover, then hold their last frame. A failed poster keeps the letter. ---------- */
const vids = [].slice.call(document.querySelectorAll('video.cover-media[data-src]'));
const prepare = v => {
if (v.__ready) return;
v.__ready = true;
const cover = v.parentNode;
const img = new Image();
img.onload = () => { v.poster = img.src; cover.classList.add('has-media'); };
img.src = v.dataset.poster;
if (still) return;
v.muted = true;
v.preload = 'auto';
v.src = v.dataset.src;
v.addEventListener('playing', () => cover.classList.add('has-media'));
v.load();
};
const start = (v, restart) => {
if (still) return;
prepare(v);
if (!restart && !v.paused && !v.ended) return;
if (restart) { try { v.currentTime = 0; } catch (e) {} }
const p = v.play();
if (p && p.catch) p.catch(() => {});
};
const seen = new Map();
const show = (v, on) => {
const was = seen.get(v);
seen.set(v, on);
if (v.loop) { if (on && !document.hidden) start(v, false); else v.pause(); }
else if (on && !was) start(v, true);
};
if (vids.length) {
vids.forEach(v => {
const card = v.closest('.card') || v.parentNode;
if (!v.loop) card.addEventListener('mouseenter', () => start(v, false));
});
document.addEventListener('visibilitychange', () => vids.forEach(v => { if (v.loop) show(v, !!seen.get(v)); }));
if (!('IntersectionObserver' in window)) {
vids.forEach(v => { prepare(v); show(v, true); });
} else {
const byCover = new Map();
/* isIntersecting alone is true at any overlap, so the visible share is checked too. */
const half = new IntersectionObserver(list => list.forEach(e => {
const v = byCover.get(e.target);
show(v, e.isIntersecting && e.intersectionRatio >= (parseFloat(v.dataset.threshold) || 0.5));
}), { threshold: [0, 0.25, 0.5] });
vids.forEach(v => { byCover.set(v.parentNode, v); half.observe(v.parentNode); });
whenNear(vids, prepare);
}
}
/* ---------- 3D glass covers. The still picture goes in first; then Three.js r128 and the card's own script
load, and the object is mounted over the picture. If anything fails, the still picture stays. ---------- */
const glasses = [].slice.call(document.querySelectorAll('.cover.glass[data-script]'));
const load = (src, sri, ok, fail) => {
const s = document.createElement('script');
s.src = src;
if (sri) { s.integrity = sri; s.crossOrigin = 'anonymous'; }
s.onload = ok;
s.onerror = fail;
document.head.appendChild(s);
};
const mount = stage => {
const pic = new Image();
pic.onload = () => { stage.style.backgroundImage = 'url("' + pic.src + '")'; };
pic.src = stage.dataset.still;
if (still) { stage.classList.add('no-gl'); return; }
const keep = window.__THREE__;   /* the page's own Three.js is a module; r128 would warn that two are loaded */
try { delete window.__THREE__; } catch (e) {}
const done = () => { if (keep) window.__THREE__ = keep; };
const fail = () => { done(); stage.classList.add('no-gl'); };
load(stage.dataset.three, stage.dataset.threeSri, () => {
done();
load(stage.dataset.script, null, () => {
const glass = window.VanragedonGlass;
if (!glass || !glass.mount(stage, { hover: stage.closest('.card') || stage, backdrop: stage.dataset.backdrop })) fail();
}, fail);
}, fail);
};
if (glasses.length) whenNear(glasses, mount);
})();