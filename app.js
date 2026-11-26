const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const sstep = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
/* ---------- Language: Spanish by default, English on request ---------- */
const TEXT = {
es: {
meta: 'John Greg, CEO & Founder de Conquer Design. Diseñador gráfico creativo: branding, redes sociales y diseño visual.',
fix: 'Revisa los campos marcados.',
sending: 'Enviando...',
sent: 'Mensaje enviado.',
failed: 'No se pudo enviar. Inténtalo otra vez o escríbeme por X a @JohnGregQuantum.'
},
en: {
meta: 'John Greg, CEO & Founder of Conquer Design. Creative graphic designer: branding, social media and visual design.',
fix: 'Check the highlighted fields.',
sending: 'Sending...',
sent: 'Message sent.',
failed: 'It could not be sent. Try again, or write to me on X at @JohnGregQuantum.'
}
};
const i18n = $$('[data-en]');
i18n.forEach(n => { n.dataset.es = n.innerHTML; });
let lang = 'es';
let doneState = 'sent';
const doneTitle = $('#form-done-title');
function setLang(l, save) {
lang = l;
document.documentElement.lang = l;
i18n.forEach(n => { n.innerHTML = l === 'en' ? n.dataset.en : n.dataset.es; });
$$('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
const meta = $('meta[name="description"]');
if (meta) meta.setAttribute('content', TEXT[l].meta);
doneTitle.textContent = TEXT[l][doneState];
if (save) { try { localStorage.setItem('jg-lang', l); } catch (e) {} }
}
try { const s = localStorage.getItem('jg-lang'); if (s === 'en' || s === 'es') lang = s; } catch (e) {}
const urlLang = /[?&]lang=(en|es)\b/.exec(location.search);
if (urlLang) lang = urlLang[1];
setLang(lang, false);
$$('.lang button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang, true)));
/* ---------- Mobile menu ---------- */
const header = $('.site-header');
const menuBtn = $('.menu-btn');
function closeMenu() { header.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); }
menuBtn.addEventListener('click', () => {
menuBtn.setAttribute('aria-expanded', String(header.classList.toggle('open')));
});
$$('.nav a').forEach(a => a.addEventListener('click', closeMenu));
/* ---------- Contact form: validates, then sends the message to John's inbox through /api/contact ---------- */
const form = $('#contact-form');
const formDone = $('#form-done');
const formStatus = $('#form-status');
const formSend = form.querySelector('button[type="submit"]');
const formShown = Date.now();
form.addEventListener('submit', async ev => {
ev.preventDefault();
const data = new FormData(form);
const name = String(data.get('name') || '').trim();
const email = String(data.get('email') || '').trim();
const message = String(data.get('message') || '').trim();
const bad = {
name: name.length < 2,
email: !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email),
message: message.length < 5
};
let firstBad = null;
Object.keys(bad).forEach(k => {
const field = form.querySelector('[name="' + k + '"]');
field.closest('label').classList.toggle('invalid', bad[k]);
field.setAttribute('aria-invalid', String(bad[k]));
if (bad[k] && !firstBad) firstBad = field;
});
if (firstBad) { formStatus.classList.remove('busy'); formStatus.textContent = TEXT[lang].fix; firstBad.focus(); return; }
if (formSend.disabled) return;
formSend.disabled = true;
formStatus.classList.add('busy');
formStatus.textContent = TEXT[lang].sending;
let ok = false;
try {
const r = await fetch('/api/contact', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ name, email, message, lang, website: String(data.get('website') || ''), ms: Date.now() - formShown })
});
const answer = await r.json().catch(() => ({}));
ok = r.ok && answer.ok === true;
} catch (e) {}
formSend.disabled = false;
formStatus.classList.remove('busy');
if (!ok) { formStatus.textContent = TEXT[lang].failed; return; }
formStatus.textContent = '';
form.reset();
form.hidden = true;
formDone.hidden = false;
});
$('#form-back').addEventListener('click', () => { formDone.hidden = true; form.hidden = false; });
/* ---------- Design pieces: a click opens the piece large; a click anywhere, the close button or Esc closes it ---------- */
const viewer = $('#viewer');
if (viewer && viewer.showModal) {
const big = viewer.querySelector('img');
$$('button.slot-open').forEach(b => b.addEventListener('click', () => {
const img = b.querySelector('img');
big.src = b.dataset.full || img.src;
big.alt = img.alt;
viewer.showModal();
}));
viewer.addEventListener('click', () => viewer.close());
viewer.addEventListener('close', () => { big.removeAttribute('src'); });
}
/* ---------- 3D world (Three.js): one fixed scene behind the whole page; the scroll is the camera ---------- */
const root = document.documentElement;
const world = $('#world');              /* fixed, full-viewport layer that holds the canvas */
const heroEl = $('.hero');
const nameEl = $('.hero h1');            /* the knot passes in front of these letters as well as behind them */
const galEl = $('#gallery');
const cardsEl = $('#gallery .cards');
const headEl = $('#gallery .section-head');
const aboutEl = $('#about');
const contactEl = $('#contact');
const copyEl = $('.contact-copy');
const snap = /[?&]snap\b/.test(location.search);   /* tests: camera follows the scroll with no easing */
/* Piecewise curve through [position, value] pairs, eased between neighbours. */
function track(v, pts) {
if (v <= pts[0][0]) return pts[0][1];
for (let i = 1; i < pts.length; i++) {
if (v <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], sstep(pts[i - 1][0], pts[i][0], v));
}
return pts[pts.length - 1][1];
}
/* How a camera move plays out, by position inside the move (0 to 1).
away: how long the sculpture stays glued to the hero. out/into: framing distance multipliers
(a negative one means the camera has flown past the sculpture). lock: turns the sculpture to face the lens
so the camera threads it. fade/rise: brightness. swap: the moment the next sculpture takes over, out of sight.
join: the stretch over which the lens re-aims at the gallery. On phones the fly-through happens early, while
the hero leaves the screen, so the text that follows is read over nothing but dust. */
const ENTER = {
wide: { away: [[0, 1], [0.22, 0]], out: [[0.05, 1], [0.6, -0.42]], lock: [[0.08, 0], [0.4, 1]], fade: [[0.3, 1], [0.55, 0.3]], swap: 0.6, join: [0.46, 0.64], into: [[0.6, 2.6], [1, 1]], rise: [[0.6, 0], [0.9, 1]] },
tall: { away: [[0, 1], [0.2, 0]], out: [[0, 1], [0.36, -0.42]], lock: [[0.03, 0], [0.2, 1]], fade: [[0.12, 1], [0.3, 0.3]], swap: 0.38, join: [0.4, 0.72], into: [[0.72, 2.6], [1, 1]], rise: [[0.72, 0], [0.95, 1]] }
};
const EXIT = { out: [[0, 1], [0.55, -0.5]], lock: [[0.1, 0], [0.4, 1]], fade: [[0.04, 1], [0.38, 0.14]], swap: 0.55, into: [[0.55, 2.4], [1, 1]], rise: [[0.55, 0], [0.9, 1]] };
const ACTS = ['knot', 'sphere', 'waves'];   /* hero, gallery + about, contact */
/* How the knot sits in the hero, as shares of the screen: centred, 126% of the screen height tall, 160% of the
screen width wide but never more than 184% of its height (so a wide laptop keeps the shape set on a squarer
window), tilted 14 degrees. */
const HERO = { x: 0.5, y: 0.5, w: 1.6, wMax: 1.84, h: 1.26, tilt: -14 * Math.PI / 180, z: 9 };
const TINTS = [[240, 180, 106], [126, 150, 255], [92, 214, 180], [255, 143, 177], [214, 206, 190]];   /* one per project card */
async function start3D() {
const THREE = await import('three');
let post = null;
try {
const mods = await Promise.all([
import('three/addons/postprocessing/EffectComposer.js'),
import('three/addons/postprocessing/RenderPass.js'),
import('three/addons/postprocessing/UnrealBloomPass.js'),
import('three/addons/postprocessing/OutputPass.js'),
import('three/addons/postprocessing/ShaderPass.js')
]);
post = Object.assign({}, ...mods);
} catch (e) {}
const BG = 0x0b0e13;
const HEAD = parseFloat(getComputedStyle(root).getPropertyValue('--head')) || 68;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(BG, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
world.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 6, 12);
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0x9fb6ff, 0x1a1208, 0.5));
const rig = new THREE.Group();
const key = new THREE.DirectionalLight(0xffd9a8, 1.7);
key.position.set(3, 4, 5);
const rim = new THREE.DirectionalLight(0x6ea8ff, 1.5);
rim.position.set(-5, -1, -3);
rig.add(key, rim);
scene.add(rig);
/* Materials are created once and shared by every model, so switching never leaks them. */
const coreOpts = { color: 0x0d1117, metalness: 0.9, roughness: 0.38, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
const coreSmooth = new THREE.MeshStandardMaterial(coreOpts);
const coreFlat = new THREE.MeshStandardMaterial(Object.assign({ flatShading: true }, coreOpts));
const wireMat = new THREE.MeshStandardMaterial({ color: 0xf0b46a, emissive: 0xf0b46a, emissiveIntensity: 0.42, metalness: 1, roughness: 0.25, wireframe: true });
/* The knot's wire glows more where its aGlow attribute is high. knotGlow 0 leaves every other model exactly as before. */
const knotGlow = { value: 0 };
wireMat.onBeforeCompile = sh => {
sh.uniforms.uKnotGlow = knotGlow;
sh.vertexShader = 'attribute float aGlow;\nvarying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
sh.fragmentShader = 'uniform float uKnotGlow;\nvarying float vGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix(1.0, 0.5 + 3.2 * vGlow, uKnotGlow);');
};
const tints = TINTS.map(c => new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace));
const tintNow = new THREE.Color();
const wireNow = new THREE.Color();
/* Dust: soft out-of-focus discs in a box that travels with the camera. Scrolling slides the whole field
past the lens (and wraps it), so the page always feels like it is moving through something. */
const DUST = 560;
const DEPTH = 26;
const TALL = 16;
const dustPos = new Float32Array(DUST * 3);
const dustSeed = new Float32Array(DUST * 2);
for (let i = 0; i < DUST; i++) {
dustPos[i * 3] = (Math.random() * 2 - 1) * 10;
dustPos[i * 3 + 1] = (Math.random() * 2 - 1) * TALL * 0.5;
dustPos[i * 3 + 2] = Math.random() * DEPTH;
dustSeed[i * 2] = Math.pow(Math.random(), 2.2);
dustSeed[i * 2 + 1] = Math.random();
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
dustGeo.setAttribute('seed', new THREE.BufferAttribute(dustSeed, 2));
const dustMat = new THREE.ShaderMaterial({
transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
uniforms: { uY: { value: 0 }, uZ: { value: 0 }, uT: { value: 0 }, uPx: { value: 1000 }, uGain: { value: 1 }, uTint: { value: new THREE.Color(0xffd9a8) } },
vertexShader: [
'attribute vec2 seed;',
'uniform float uY; uniform float uZ; uniform float uT; uniform float uPx;',
'varying float vA;',
'void main() {',
'  vec3 p = position;',
'  p.y = mod(p.y + uY + ' + (TALL * 0.5).toFixed(1) + ', ' + TALL.toFixed(1) + ') - ' + (TALL * 0.5).toFixed(1) + ';',
'  p.z = -mod(p.z - uZ, ' + DEPTH.toFixed(1) + ');',
'  p.x += sin(uT * 0.21 + seed.y * 6.2831) * 0.14;',
'  p.y += cos(uT * 0.17 + seed.y * 4.7) * 0.1;',
'  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
'  float d = max(0.05, -mv.z);',
'  float size = uPx * (0.016 + seed.x * 0.075) / d;',
'  gl_PointSize = clamp(size, 1.0, 96.0);',
'  float near = smoothstep(0.5, 2.4, d);',
'  float far = 1.0 - smoothstep(' + (DEPTH * 0.45).toFixed(1) + ', ' + (DEPTH * 0.96).toFixed(1) + ', d);',
'  float seam = smoothstep(0.0, 0.1, 0.5 - abs(p.y) / ' + TALL.toFixed(1) + ');',
'  float soft = clamp(7.0 / size, 0.1, 1.0);',
'  vA = near * far * seam * soft * (0.3 + 0.7 * fract(seed.y * 7.31));',
'  gl_Position = projectionMatrix * mv;',
'}'
].join('\n'),
fragmentShader: [
'uniform vec3 uTint; uniform float uGain;',
'varying float vA;',
'void main() {',
'  float r = length(gl_PointCoord - 0.5) * 2.0;',
'  float disc = 1.0 - smoothstep(0.7, 1.0, r);',
'  float ring = smoothstep(0.45, 0.85, r) * 0.4;',
'  float a = disc * (0.6 + ring) * vA * uGain;',
'  if (a < 0.004) discard;',
'  gl_FragColor = vec4(uTint, a);',
'  #include <tonemapping_fragment>',
'  #include <colorspace_fragment>',
'}'
].join('\n')
});
const dust = new THREE.Points(dustGeo, dustMat);
dust.frustumCulled = false;
camera.add(dust);
/* The knot is built here instead of with TorusKnotGeometry (p 2, q 3, radius 0.94, a thin 0.19 tube,
190 x 20 segments), so its mesh can slide along its own path: it flows forward and back like
a breath, while two lights run along it in opposite directions and cross. */
const KP = 2, KQ = 3, KR = 0.94, KTUBE = 0.19, KTS = 190, KRS = 20, TAU = Math.PI * 2;
const kP1 = new THREE.Vector3(), kP2 = new THREE.Vector3(), kT = new THREE.Vector3(), kN = new THREE.Vector3(), kB = new THREE.Vector3(), kV = new THREE.Vector3();
function onKnot(u, out) {
const cs = Math.cos(KQ / KP * u);
return out.set(KR * (2 + cs) * 0.5 * Math.cos(u), KR * (2 + cs) * 0.5 * Math.sin(u), KR * Math.sin(KQ / KP * u) * 0.5);
}
/* A soft band of light centred on 0 along the loop (0 to 1, wrapping). */
const knotBand = (x, w) => { const d = Math.abs(((x % 1) + 1.5) % 1 - 0.5); return Math.exp(-(d * d) / (w * w)); };
function knotGeometry() {
const count = (KTS + 1) * (KRS + 1);
const index = [];
for (let j = 1; j <= KTS; j++) for (let i = 1; i <= KRS; i++) {
const a = (KRS + 1) * (j - 1) + (i - 1), b = (KRS + 1) * j + (i - 1), c = (KRS + 1) * j + i, d = (KRS + 1) * (j - 1) + i;
index.push(a, b, d, b, c, d);
}
const g = new THREE.BufferGeometry();
g.setIndex(index);
g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(count), 1));
flowKnot(g, 0);
return g;
}
function flowKnot(g, t) {
const pos = g.attributes.position.array, nor = g.attributes.normal.array, glowAt = g.attributes.aGlow.array;
const slide = 0.06 * Math.sin(t * 0.8);   // the mesh moves along the knot, then back
for (let j = 0; j <= KTS; j++) {
const s = j / KTS + slide;              // where this ring sits on the curve
const u = s * KP * TAU;
onKnot(u, kP1); onKnot(u + 0.01, kP2);
kT.subVectors(kP2, kP1); kN.addVectors(kP2, kP1); kB.crossVectors(kT, kN); kN.crossVectors(kB, kT); kB.normalize(); kN.normalize();
const light = knotBand(s - t * 0.11, 0.045) + knotBand(s + t * 0.11 + 0.5, 0.045);
for (let i = 0; i <= KRS; i++) {
const v = i / KRS * TAU, cx = -KTUBE * Math.cos(v), cy = KTUBE * Math.sin(v);
const n = j * (KRS + 1) + i;
kV.set(kP1.x + cx * kN.x + cy * kB.x, kP1.y + cx * kN.y + cy * kB.y, kP1.z + cx * kN.z + cy * kB.z);
pos[n * 3] = kV.x; pos[n * 3 + 1] = kV.y; pos[n * 3 + 2] = kV.z;
kV.sub(kP1).normalize();
nor[n * 3] = kV.x; nor[n * 3 + 1] = kV.y; nor[n * 3 + 2] = kV.z;
glowAt[n] = light;
}
}
g.attributes.position.needsUpdate = true;
g.attributes.normal.needsUpdate = true;
g.attributes.aGlow.needsUpdate = true;
}
/* Procedural models. Each one only knows how to build (and optionally animate) its geometry.
k is the framing constant: distance at which the model spans the short side of the screen. */
const MODELS = {
knot: {
label: 'Torus Knot', flat: false, tilt: 0.18, spin: 0.24, y: 0, fog: [-4, 8], glow: 0.35, flow: true,
create: knotGeometry,
animate: flowKnot
},
sphere: {
label: 'Abstract Sphere', flat: true, tilt: 0.2, spin: 0.18, y: 0, fog: [0.2, 4.6], glow: 1, k: 5,
create() {
const g = new THREE.IcosahedronGeometry(1.36, 11);
g.userData.base = g.attributes.position.array.slice();
return g;
},
animate(g, t) {
const p = g.attributes.position;
const a = p.array;
const b = g.userData.base;
for (let i = 0; i < b.length; i += 3) {
const x = b[i], y = b[i + 1], z = b[i + 2];
const n = Math.sin(x * 2.3 + t * 0.9) * Math.cos(y * 2.9 - t * 0.7) + 0.55 * Math.sin(z * 4.1 + t * 1.3) + 0.3 * Math.sin((x - y) * 5.2 - t * 1.1);
const k = 1 + 0.12 * n;
a[i] = x * k; a[i + 1] = y * k; a[i + 2] = z * k;
}
p.needsUpdate = true;
}
},
waves: {
label: 'Wave Grid', flat: true, tilt: 0.46, spin: 0.07, y: -0.45, fog: [1.9, 3.9], glow: 1.9, k: 4.4,
create() {
const g = new THREE.PlaneGeometry(12, 12, 84, 84);
g.rotateX(-Math.PI / 2);
return g;
},
animate(g, t) {
const p = g.attributes.position;
const a = p.array;
for (let i = 0; i < a.length; i += 3) {
const x = a[i], z = a[i + 2];
const r = Math.sqrt(x * x + z * z);
a[i + 1] = 0.22 * Math.sin(x * 1.5 + t * 1.2) + 0.16 * Math.sin(z * 2.1 - t * 0.9) + 0.12 * Math.sin(r * 2.4 - t * 2.1);
}
p.needsUpdate = true;
}
}
};
/* stretch sizes and tilts the hero knot in screen space; model turns inside it, so the knot keeps its width as it spins. */
const stretch = new THREE.Group();
const model = new THREE.Group();
stretch.add(model);
scene.add(stretch);
let current = null;
let queued = null;
const heroModel = 'knot';
let act = 0;
let grow = calm ? 1 : 0;
let rotX = 0, rotY = 0.6, velX = 0, velY = 0;
let hoverX = 0, hoverY = 0, hoverTX = 0, hoverTY = 0;
let fit = 1;
let t = 0;
let fogNear = 0.2, fogFar = 4.6;
let glow = 0.42;
let dpr = 1;
let s = window.scrollY, lastY = s, rush = 0;
const view = { w: 1, h: 1, vh: 1, wide: true };
const lay = { ok: false, orbit: false, a0: 0, len1: 1, e0: 0, e1: 1, a2: 0, len2: 1, g0: 0, gl: 1, span: 1.5 };
const shot = { x: 0, y: 0, d: 6, dim: 1, lock: 0, tint: 0, t1: 0, t2: 0 };
/* Removes the current meshes and frees their geometry buffers on the GPU. */
function clearModel() {
if (!current) return;
model.remove(current.core, current.wire);
current.geo.dispose();
current = null;
}
/* Builds a new procedural mesh: a dark faceted body plus the luminous metallic wireframe. */
function createModel(name) {
const def = MODELS[name];
const geo = def.create();
if (def.animate) def.animate(geo, t);
const core = new THREE.Mesh(geo, def.flat ? coreFlat : coreSmooth);
const wire = new THREE.Mesh(geo, wireMat);
core.frustumCulled = false;
wire.frustumCulled = false;
model.add(core, wire);
current = { name, def, geo, core, wire };
rotX = def.tilt;
velX = 0;
fogNear = def.fog[0];
fogFar = def.fog[1];
glow = 0.42 * def.glow * (dpr > 1 ? 1.3 : 1);
}
function swapModel(name) {
clearModel();
createModel(name);
}
let composer = null;
let film = null;
if (post) {
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
composer = new post.EffectComposer(renderer, target);
composer.addPass(new post.RenderPass(scene, camera));
composer.addPass(new post.UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.35, 0.32));
composer.addPass(new post.OutputPass());
/* Lens pass: colour fringing that grows with scroll speed, a vignette and a little film grain. */
film = new post.ShaderPass({
uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uK: { value: 0 } },
vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
fragmentShader: [
'uniform sampler2D tDiffuse; uniform float uT; uniform float uK;',
'varying vec2 vUv;',
'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
'void main() {',
'  vec2 c = vUv - 0.5;',
'  float r2 = dot(c, c);',
'  vec2 o = c * (0.0011 + uK) * (0.35 + r2 * 2.6);',
'  vec3 col = vec3(texture2D(tDiffuse, vUv + o).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - o).b);',
'  col *= 1.0 - smoothstep(0.1, 0.62, r2) * 0.38;',
'  col += (hash(vUv * vec2(1387.13, 941.7) + fract(uT * 0.37) * 53.0) - 0.5) * 0.04;',
'  gl_FragColor = vec4(col, 1.0);',
'}'
].join('\n')
});
composer.addPass(film);
}
/* The front of the name: a second, see-through canvas laid over the title draws only the half of the hero knot
that is nearer the camera (its gold wire; its dark body only hides the wire behind it). The main canvas draws
the whole knot under the text, so the knot passes in front of the letters as well as behind them. The canvas
covers just the title, shares the knot's mesh and camera, and fades out as soon as the knot leaves the hero. */
let front = null;
try {
const canvas = document.createElement('canvas');
canvas.className = 'knot-front';
canvas.setAttribute('aria-hidden', 'true');
const fr = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
fr.setClearColor(0x000000, 0);
fr.toneMapping = THREE.ACESFilmicToneMapping;
fr.localClippingEnabled = true;
const fscene = new THREE.Scene();
fscene.add(new THREE.HemisphereLight(0x9fb6ff, 0x1a1208, 0.5));
const frig = new THREE.Group();
const fkey = key.clone(), frim = rim.clone();
frig.add(fkey, frim);
fscene.add(frig);
const near = [new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)];
const fcoreMat = new THREE.MeshStandardMaterial(Object.assign({ clippingPlanes: near }, coreOpts));
fcoreMat.colorWrite = false;
const fwireMat = new THREE.MeshStandardMaterial({ color: 0xf0b46a, emissive: 0xf0b46a, emissiveIntensity: 0.62, metalness: 1, roughness: 0.25, wireframe: true, clippingPlanes: near });
fwireMat.onBeforeCompile = wireMat.onBeforeCompile;
const fstretch = new THREE.Group(), fmodel = new THREE.Group();
const fcore = new THREE.Mesh(new THREE.BufferGeometry(), fcoreMat), fwire = new THREE.Mesh(new THREE.BufferGeometry(), fwireMat);
fcore.renderOrder = 0; fwire.renderOrder = 1;
fcore.frustumCulled = fwire.frustumCulled = false;
fmodel.add(fcore, fwire);
fstretch.add(fmodel);
fscene.add(fstretch);
document.body.appendChild(canvas);
front = { canvas, fr, fscene, frig, fkey, frim, fstretch, fmodel, fcore, fwire, fwireMat, cam: new THREE.PerspectiveCamera(), size: '' };
} catch (e) { front = null; }
let shown = 0;
function drawFront(now) {
if (!front) return;
const f = front;
const appear = shown ? clamp((now - shown) / 1400, 0, 1) : 0;
const vis = current.def.flow && act === 0 ? appear * (1 - sstep(0.02, 0.14, shot.t1)) : 0;
const r = nameEl.getBoundingClientRect();
const pad = 24;
const L = Math.floor(r.left - pad), T = Math.floor(r.top - pad);
const w = Math.ceil(r.width + 2 * pad), h = Math.ceil(r.height + 2 * pad);
if (vis < 0.01 || T + h < 0 || T > view.h || w < 2 || h < 2) {
if (f.canvas.style.visibility !== 'hidden') { f.canvas.style.visibility = 'hidden'; f.canvas.style.opacity = '0'; }
return;
}
const size = w + 'x' + h + '@' + dpr;
if (size !== f.size) {
f.size = size;
f.fr.setPixelRatio(dpr);
f.fr.setSize(w, h, false);
f.canvas.style.width = w + 'px';
f.canvas.style.height = h + 'px';
}
f.canvas.style.transform = 'translate(' + L + 'px,' + T + 'px)';
f.canvas.style.opacity = vis.toFixed(3);
f.canvas.style.visibility = 'visible';
/* Same lens as the main camera, cropped to the title's box. */
f.cam.copy(camera);
f.cam.setViewOffset(view.w, view.h, view.w / 2 - shot.x - hoverX * 12 + L, view.h / 2 - shot.y - hoverY * 9 + T, w, h);
f.fstretch.scale.copy(stretch.scale);
f.fstretch.rotation.copy(stretch.rotation);
f.fmodel.scale.copy(model.scale);
f.fmodel.rotation.copy(model.rotation);
f.fmodel.position.copy(model.position);
f.fcore.geometry = f.fwire.geometry = current.geo;
f.frig.rotation.y = rig.rotation.y;
f.fkey.intensity = key.intensity;
f.frim.intensity = rim.intensity;
f.fwireMat.emissiveIntensity = glow / 0.42 * 0.62 * shot.dim;
f.fr.render(f.fscene, f.cam);
}
/* Safety net for slow devices: if frames stay long, drop the glow and lens passes first, then the pixel density.
The page listens for the "lite" class to drop its own expensive effects (glass blur). */
const lockQuality = /[?&]quality=full\b/.test(location.search);
let quality = 2;
let maxDpr = 1.5;
let slowFrames = 0;
function watchSpeed(raw) {
if (lockQuality || quality === 0) return;
slowFrames = raw > 42 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
if (slowFrames < 50) return;
slowFrames = 0;
quality -= 1;
root.classList.add('lite');
if (composer) {
composer.passes.forEach(pass => { if (pass.dispose) pass.dispose(); });
composer.dispose();
composer = null;
film = null;
}
if (quality === 0) maxDpr = 1;
resize();
}
/* Keeps the drawing buffer and the camera in sync with the fixed layer. The layer has a constant height
(it ignores phone toolbars sliding in and out), so the buffers are only rebuilt when something really changed. */
let sized = '';
function resize() {
const w = world.clientWidth;
const h = world.clientHeight;
if (!w || !h) return;
dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
const size = w + 'x' + h + '@' + dpr + (composer ? '+post' : '');
if (size !== sized) {
sized = size;
renderer.setPixelRatio(dpr);
renderer.setSize(w, h, false);
if (composer) { composer.setPixelRatio(dpr); composer.setSize(w, h); }
view.w = w; view.h = h; view.vh = h; view.wide = w >= 900;
camera.aspect = w / h;
fit = camera.aspect < 1 ? 1 / camera.aspect : 1;
dustMat.uniforms.uPx.value = h * dpr * 1.6355;
if (current) glow = 0.42 * current.def.glow * (dpr > 1 ? 1.3 : 1);
}
measure();
wake();
}
/* Page landmarks (in document pixels) that the camera moves are tied to. */
function measure() {
const y = window.scrollY;
const H = view.h;
const top = el => el.getBoundingClientRect().top + y;
const zr = heroEl.getBoundingClientRect();
const gt = top(galEl);
const gb = gt + galEl.offsetHeight;
lay.orbit = root.classList.contains('orbit');
lay.a0 = Math.max(0, zr.top + y + zr.height / 2 - 0.4 * H);
lay.len1 = Math.max(H * 0.5, (lay.orbit ? gt - HEAD : gt - 0.35 * H) - lay.a0);
lay.e0 = lay.orbit ? gb - H : top(aboutEl) - 0.9 * H;
lay.e1 = lay.e0 + 0.7 * H;
lay.a2 = top(contactEl) - 1.05 * H;
lay.len2 = 0.85 * H;
lay.g0 = gt - 0.5 * H;
lay.gl = Math.max(1, gb - gt);
/* On narrow screens the sphere is as big as the space under the gallery heading allows (at most 1.5 screen widths). */
lay.span = lay.orbit ? clamp(2 * (cardsEl.getBoundingClientRect().top - headEl.getBoundingClientRect().bottom + 0.05 * H) / view.w, 0.7, 1.5) : 0.8;
lay.ok = true;
}
/* The director: turns the (eased) scroll position into one shot: where the sculpture sits on screen,
how far the camera is, how bright it burns and which sculpture is on stage. */
function direct() {
const W = view.w, H = view.vh, wide = view.wide;
const zx = W * HERO.x, zy = H * HERO.y - window.scrollY;   /* the hero knot scrolls with the page until it lets go */
const heroD = HERO.z / fit;
if (calm || !lay.ok) {
shot.x = zx; shot.y = zy; shot.d = heroD; shot.dim = 1; shot.lock = 0; shot.tint = 0; shot.t1 = 0; shot.t2 = 0;
return;
}
const M = wide ? ENTER.wide : ENTER.tall;
const t1 = clamp((s - lay.a0) / lay.len1, 0, 1);
const t2 = clamp((s - lay.a2) / lay.len2, 0, 1);
/* Which sculpture owns this stretch of the page (with a little slack so it never flickers at the seam). */
for (let i = 0; i < 2; i++) {
if (act === 0 && t1 > M.swap + 0.012) act = 1;
else if (act === 1 && t1 < M.swap - 0.012) act = 0;
else if (act === 1 && t2 > EXIT.swap + 0.012) act = 2;
else if (act === 2 && t2 < EXIT.swap - 0.012) act = 1;
}
const name = act === 0 ? heroModel : ACTS[act];
if (current.name !== name && queued !== name) { queued = null; swapModel(name); grow = 1; }
/* Screen positions the sculpture travels between. */
let ox = W * 0.5, oy = H * (wide ? 0.52 : 0.5);
if (lay.orbit) { const c = cardsEl.getBoundingClientRect(); ox = c.left; oy = c.top; }
const fx = W * 0.5, fy = H * (wide ? 0.48 : 0.34);                     /* where it hangs once it lets go of the hero */
const ax = W * (wide ? 0.76 : 0.8), ay = H * (wide ? 0.44 : 0.17);       /* resting place while "about" is read */
/* The horizon for "contact" comes up with the page and always stays under the text. */
const cx = W * 0.5, cy = Math.max(H * (wide ? 0.84 : 0.8), t2 > 0.3 ? copyEl.getBoundingClientRect().bottom + H * 0.27 : 0);
const join = sstep(M.join[0], M.join[1], t1);
const leave = sstep(lay.e0, lay.e1, s);
const land = sstep(EXIT.swap - 0.2, EXIT.swap + 0.05, t2);
shot.t1 = t1; shot.t2 = t2;
if (act === 0) {
const away = track(t1, M.away);
shot.x = lerp(lerp(fx, zx, away), ox, join);
shot.y = lerp(lerp(fy, zy, away), oy, join);
shot.d = heroD * track(t1, M.out);
shot.dim = track(t1, M.fade);
shot.lock = track(t1, M.lock);
shot.tint = 0;
return;
}
shot.x = lerp(lerp(lerp(fx, ox, join), ax, leave), cx, land);
shot.y = lerp(lerp(lerp(fy, oy, join), ay, leave), cy, land);
if (act === 1) {
const full = wide ? (lay.orbit ? 0.78 : 0.5) : lay.span;               /* share of the short side the sphere fills */
shot.d = MODELS.sphere.k / full * track(t1, M.into) * lerp(1, wide ? 1.9 : 3.4, leave) * track(t2, EXIT.out);
shot.dim = track(t1, M.rise) * lerp(lay.orbit ? 1 : 0.55, wide ? 0.5 : 0.36, leave) * track(t2, EXIT.fade);
shot.lock = track(t2, EXIT.lock);
shot.tint = sstep(M.swap, 1, t1) * (1 - leave);
} else {
shot.d = (wide ? 5 : 5.6) * track(t2, EXIT.into);
shot.dim = track(t2, EXIT.rise);
shot.lock = 0;
shot.tint = 0;
}
}
/* The mouse sways the sculpture gently from anywhere on the page. */
window.addEventListener('pointermove', ev => {
if (ev.pointerType !== 'mouse') return;
hoverTX = (ev.clientX / window.innerWidth) * 2 - 1;
hoverTY = (ev.clientY / window.innerHeight) * 2 - 1;
}, { passive: true });
root.addEventListener('pointerleave', () => { hoverTX = 0; hoverTY = 0; });
let raf = 0;
let last = 0;
let painted = false;
function frame(now) {
raf = 0;
const raw = now - last;
const dt = Math.min(0.1, raw / 1000);
last = now;
watchSpeed(raw);
if (!calm) t += dt;
/* The page moves under the finger; the camera glides after it. */
const y = window.scrollY;
if (dt > 0) rush += (clamp(Math.abs(y - lastY) / dt / 4200, 0, 1) - rush) * 0.14;
lastY = y;
s = snap || calm ? y : s + (y - s) * (1 - Math.exp(-dt * 7));
if (Math.abs(y - s) < 0.1) s = y;
direct();
if (queued) {
grow -= dt / 0.26;
if (grow <= 0) { grow = 0; swapModel(queued); queued = null; }
} else if (grow < 1) {
grow = Math.min(1, grow + dt / 0.65);
}
const sg = grow * grow * (3 - 2 * grow);
model.scale.setScalar(Math.max(sg, 0.0001));
const lock = shot.lock;
rotX += velX; rotY += velY;
velX *= 0.93; velY *= 0.93;
if (!calm) rotY += dt * (current.def.spin + (1 - sg) * 2.4) * (1 - lock) * (1 - lock);
rotX = clamp(rotX, -1.25, 1.35);
hoverX += (hoverTX - hoverX) * 0.06;
hoverY += (hoverTY - hoverY) * 0.06;
/* In the gallery the sphere turns with the project cards, like the hub they orbit. */
const orbit = window.__orbit;
const yaw = rotY - (act === 1 && orbit ? orbit.u * orbit.step : 0);
const face = Math.round(yaw / Math.PI) * Math.PI;
model.rotation.set(lerp(rotX + hoverY * 0.1, 0, lock), lerp(yaw + hoverX * 0.16, face, lock), 0);
model.position.y = current.def.y + (calm ? 0 : Math.sin(t * 0.8) * 0.04);
/* The hero knot is stretched to the shares of the screen in HERO (measured from HERO.z, where the camera sees
0.611 x HERO.z units of height, and the knot is 3.4 units across). Every other sculpture keeps its own shape. */
if (current.name === 'knot') {
const seen = 0.6114 * HERO.z;
const sx = seen * Math.min(HERO.w * view.w, HERO.wMax * view.h) / view.h / 3.4;
const sy = seen * HERO.h / 3.4;
stretch.scale.set(sx, sy, Math.min(sx, sy));
stretch.rotation.z = HERO.tilt;
} else {
stretch.scale.setScalar(1);
stretch.rotation.z = 0;
}
if (current.def.animate && !calm) current.def.animate(current.geo, t);
/* Lens: the camera stays on the sculpture's axis and the view is shifted so it lands on the chosen screen point. */
const z = fit * shot.d;
camera.position.set(0, 0, z);
camera.setViewOffset(view.w, view.h, view.w / 2 - shot.x - hoverX * 12, view.h / 2 - shot.y - hoverY * 9, view.w, view.h);
const zf = Math.max(0.6, Math.abs(z));
scene.fog.near = zf - fogNear;
scene.fog.far = zf + fogFar;
rig.rotation.y = t * 0.35;
/* Light and colour: brightness follows the shot; in the gallery the wire takes the colour of the project in front. */
const lit = 0.3 + 0.7 * shot.dim;
key.intensity = 1.7 * lit;
rim.intensity = 1.5 * lit;
wireMat.emissiveIntensity = glow * shot.dim;
knotGlow.value = current.def.flow && !calm ? 1 : 0;
model.visible = shot.dim > 0.01;
const u = orbit ? orbit.u : clamp((s - lay.g0) / lay.gl, 0, 1) * (tints.length - 1);
const ti = clamp(Math.floor(u), 0, tints.length - 2);
tintNow.lerpColors(tints[ti], tints[ti + 1], clamp(u - ti, 0, 1));
wireNow.lerpColors(tints[0], tintNow, shot.tint);
wireMat.color.copy(wireNow);
wireMat.emissive.copy(wireNow);
dustMat.uniforms.uY.value = s * 0.0017 + t * 0.03;
dustMat.uniforms.uZ.value = s * 0.0062 + t * 0.14;
dustMat.uniforms.uT.value = t;
if (film) { film.uniforms.uT.value = t; film.uniforms.uK.value = rush * 0.0075; }
if (composer) composer.render(dt); else renderer.render(scene, camera);
drawFront(now);
if (!painted) { painted = true; shown = now; world.classList.add('ready'); }
if (!document.hidden) raf = requestAnimationFrame(frame);
}
function wake() {
if (raf || document.hidden) return;
last = performance.now();
raf = requestAnimationFrame(frame);
}
resize();
createModel('knot');
if ('ResizeObserver' in window) {
new ResizeObserver(resize).observe(world);
/* The page gets taller or shorter when the gallery switches layout or fonts arrive: re-read the landmarks. */
new ResizeObserver(measure).observe(document.body);
}
window.addEventListener('resize', resize);
window.addEventListener('load', measure);
document.addEventListener('visibilitychange', wake);
window.addEventListener('pageshow', wake);
wake();
window.__stage3d = {
renderer, measure,
state: () => ({ model: current.name, hero: heroModel, front: front ? +front.canvas.style.opacity || 0 : -1, queued, grow, act, quality, dpr, rotX, rotY, s, z: camera.position.z, x: shot.x, y: shot.y, dim: shot.dim, lock: shot.lock, tint: shot.tint, t1: shot.t1, t2: shot.t2, orbit: lay.orbit, wire: '#' + wireMat.color.getHexString(), aspect: camera.aspect, memory: Object.assign({}, renderer.info.memory), programs: renderer.info.programs ? renderer.info.programs.length : 0 })
};
}
start3D().catch(() => {
root.classList.add('no-webgl');
});