/* Vanragedon Circuit as a crystal object, for the gallery card.
A glass block with the game inside, its two light cords, ribbons of light around it and an
echo of the gallery's wire sphere behind. It moves on its own and turns toward the pointer.
Needs Three.js r128 (window.THREE). Use:
VanragedonGlass.mount(stage, { hover: card, backdrop: url })
where stage holds <canvas class="gl"> and <canvas class="bloom">, card is the element whose
pointer moves turn the object (defaults to the stage), and url is the level picture (WebP, 1024x512).
Changes for the portfolio site: the level picture is a separate file (loaded with CORS so it can be a
texture), the size is read from the layout instead of the screen box (the gallery turns its cards in 3D),
it re-fits whenever the card changes size, pixel density is capped at 1.5 like the rest of the page,
and the glow canvas is dropped when the page has switched to its lighter mode on a slow device. */
(function (global) {
"use strict";
// A real round recorded from the game (level 31, against The Prism): the corner points of
// each trail as [x, y, seconds] on the 960×600 board. The player wins it: The Prism runs
// into the player's trail.
const ROUND = {"time":12.9,"player":[[216,300,0],[588,300,2.48],[588,336,2.72],[240,336,5.04],[240,360,5.2],[636,360,7.84],[636,312,8.16],[672,312,8.4],[672,348,8.64],[708,348,8.88],[708,300,9.2],[672,300,9.44],[672,276,9.6],[216,276,12.357],[216,184.8,12.9]],"prism":[[744,300,0],[744,264,0.121],[240,264,1.818],[240,228,1.939],[744,228,3.636],[744,384,4.162],[456,384,5.131],[456,420,5.253],[768,420,6.303],[768,216,6.99],[192,216,8.929],[192,180,9.051],[768,180,10.884],[768,240,11.065],[288,240,12.507],[288,180,12.687],[217.3,180,12.9]]};
const BOARD_W = 960, BOARD_H = 600;
const PRISM_TRAIL = 1000;   // The Prism's trail fades after this many pixels, as in the game
const ENRAGE_AT = 12;       // seconds: The Prism turns pink, as in the game
const AFTER = 2.4;          // seconds between the crash and the next replay
const CYAN = 0x28D7FF, VIOLET = 0xB48CFF, PERI = 0x7C83F0, GOLD = 0xF2C879, WARM = 0xFFE7C2, STAGE = 0x04050B;
const clamp01 = x => Math.max(0, Math.min(1, x));
function build(T, parts) {
const scene = parts.scene, root = parts.root, camera = parts.camera;
const v3 = (x, y, z) => new T.Vector3(x, y, z);
// Light that adds to what is behind it.
const ADD = { transparent: true, depthWrite: false, blending: T.AdditiveBlending };
// ---------- textures drawn here ----------
function canvasTex(w, h, draw) {
const c = document.createElement("canvas"); c.width = w; c.height = h;
draw(c.getContext("2d"), w, h);
const tex = new T.CanvasTexture(c); tex.anisotropy = 4;
return tex;
}
const dotTex = canvasTex(64, 64, g => {
const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(.28, "rgba(255,255,255,.5)"); r.addColorStop(1, "rgba(255,255,255,0)");
g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});
// A streak of light with a long tail on a line that can stay faintly lit (base).
function flowTex(base, tail, head) {
const tex = canvasTex(256, 4, (g, w, h) => {
const l = g.createLinearGradient(0, 0, w, 0);
l.addColorStop(0, base); l.addColorStop(.5, base); l.addColorStop(.86, tail); l.addColorStop(.95, head); l.addColorStop(.975, "#FFFFFF"); l.addColorStop(1, base);
g.fillStyle = l; g.fillRect(0, 0, w, h);
});
tex.wrapS = T.RepeatWrapping;
return tex;
}
// The Prism seen from above, as the game draws it: a brilliant cut.
const gemTex = canvasTex(128, 128, g => {
g.translate(64, 64);
const R = 44, rt = R * .48, rs = R * .74, at = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
const facet = (poly, angle) => {
const lit = .5 + .5 * Math.cos(angle - .9);
g.fillStyle = "rgb(" + [70 + 185 * lit, 45 + 205 * lit, 170 + 85 * lit].map(Math.round).join(",") + ")";
g.beginPath(); poly.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill();
};
g.fillStyle = "rgb(210,195,255)"; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
for (let k = 0; k < 8; k++) {
const a = k / 8 * Math.PI * 2, a1 = a + Math.PI / 4, aStar = a + Math.PI / 8;
const v0 = at(a, rt), v1 = at(a1, rt), s0 = at(aStar, rs), sPrev = at(a - Math.PI / 8, rs), g0 = at(a, R), gHalf = at(aStar, R), g1 = at(a1, R);
facet([sPrev, g0, s0, v0], a); facet([s0, g0, gHalf], aStar - .2); facet([s0, gHalf, g1], aStar + .2); facet([v0, v1, s0], aStar + Math.PI);
}
g.fillStyle = "rgb(246,242,255)"; g.beginPath();
for (let k = 0; k < 8; k++) { const p = at(k / 8 * Math.PI * 2, rt); k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }
g.closePath(); g.fill();
g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
});
function glowDot(color, size, opacity) {
const s = new T.Sprite(new T.SpriteMaterial(Object.assign({ map: dotTex, color, opacity: opacity === undefined ? 1 : opacity }, ADD)));
s.scale.set(size, size, 1);
return s;
}
function dust(count, box, color, size, seed) {
let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const pos = new Float32Array(count * 3);
for (let i = 0; i < count; i++) { pos[i * 3] = (rnd() - .5) * box[0]; pos[i * 3 + 1] = (rnd() - .5) * box[1]; pos[i * 3 + 2] = (rnd() - .5) * box[2]; }
const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.BufferAttribute(pos, 3));
const pts = new T.Points(geo, new T.PointsMaterial(Object.assign({ map: dotTex, color, size, opacity: .85 }, ADD)));
pts.renderOrder = 7;
return pts;
}
function roundedRect(w, h, r) {
const s = new T.Shape(), x = -w / 2, y = -h / 2;
s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
return s;
}
camera.position.set(0, 0, 11);
scene.add(new T.AmbientLight(0x555A8A, .9));
const key = new T.PointLight(WARM, 1.1); key.position.set(4, 4, 6); scene.add(key);
const CENTER = v3(.2, -.08, 0);
// ---------- an echo of the wire sphere the gallery cards float in front of ----------
const sphereGeo = new T.IcosahedronGeometry(1, 3), ball = sphereGeo.attributes.position.array.slice();
function shapeSphere(time) {
const p = sphereGeo.attributes.position;
for (let i = 0; i < p.count; i++) {
const x = ball[i * 3], y = ball[i * 3 + 1], z = ball[i * 3 + 2];
const r = 3.45 * (1 + .15 * Math.sin(2.1 * x + 1.2 * y + time * .21) + .12 * Math.sin(2.6 * y - 1.7 * z + 1.3 + time * .17) + .10 * Math.sin(1.9 * z + 2.3 * x + 2.9 - time * .13));
p.setXYZ(i, x * r, y * r, z * r);
}
p.needsUpdate = true;
}
shapeSphere(0);
const sphere = new T.Mesh(sphereGeo, new T.MeshBasicMaterial({ color: PERI, wireframe: true, transparent: true, opacity: .13, depthWrite: false }));
sphere.position.set(CENTER.x + .2, CENTER.y + .05, -3.4); sphere.renderOrder = -3; sphere.frustumCulled = false; root.add(sphere);
// the warm light the big sphere carries on its upper right
const sunrise = glowDot(0xFFD9A8, 4.6, .13); sunrise.position.set(sphere.position.x + 2.3, sphere.position.y + 2.0, -2.6); sunrise.renderOrder = -3; root.add(sunrise);
// ---------- the crystal block ----------
// Cut like a gem: a flat table over the board, two steps of bevel around it and the corners cut off.
const SW = 4.2, SH = SW * BOARD_H / BOARD_W;      // the board inside
const TABLE = .2, BEV = .17, BEV_DEPTH = .13, CUT = .34, DEPTH = .62;
const W = SW + (TABLE + BEV) * 2, H = SH + (TABLE + BEV) * 2;
const holder = new T.Group(); holder.position.copy(CENTER); root.add(holder);
function cutRect(w, h, c) {
const s = new T.Shape(), x = w / 2, y = h / 2;
s.moveTo(-x + c, -y); s.lineTo(x - c, -y); s.lineTo(x, -y + c); s.lineTo(x, y - c);
s.lineTo(x - c, y); s.lineTo(-x + c, y); s.lineTo(-x, y - c); s.lineTo(-x, -y + c); s.closePath();
return s;
}
const slabGeo = new T.ExtrudeGeometry(cutRect(W - BEV * 2, H - BEV * 2, CUT), { depth: DEPTH - BEV_DEPTH * 2, bevelEnabled: true, bevelThickness: BEV_DEPTH, bevelSize: BEV, bevelSegments: 2 });
slabGeo.translate(0, 0, -(DEPTH - BEV_DEPTH * 2) / 2);
const VERT = "varying vec3 vN; varying vec3 vV; varying vec3 vP;\nvoid main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; vP = position; gl_Position = projectionMatrix * mv; }";
// Dark glass that lights up on its edges and bevels.
function glassBody(alpha, side) {
return new T.ShaderMaterial({
transparent: true, depthWrite: side === T.FrontSide, side,
uniforms: { uInner: { value: new T.Color(0x0C1142) }, uRim: { value: new T.Color(0x8EA2F2) }, uAlpha: { value: alpha } },
vertexShader: VERT,
fragmentShader: [
"uniform vec3 uInner; uniform vec3 uRim; uniform float uAlpha; varying vec3 vN; varying vec3 vV; varying vec3 vP;",
"void main() {",
"  vec3 n = normalize(vN), v = normalize(vV);",
"  float ndv = clamp(abs(dot(n, v)), 0.0, 1.0), rim = pow(1.0 - ndv, 2.1);",
"  float lit = 0.5 + 0.5 * dot(n, normalize(vec3(0.35, 0.62, 0.7)));",   // each facet takes the light its own way
"  vec3 inner = uInner * (0.55 + 1.1 * smoothstep(-1.7, 1.5, vP.y)) * (0.5 + 1.3 * lit * lit);",
"  gl_FragColor = vec4(mix(inner, uRim, rim), mix(uAlpha, 1.0, clamp(rim, 0.0, 1.0)));",
"}"].join("\n")
});
}
// What the glass reflects, added on top of everything inside it: a warm light on its upper
// edges, a cool one from below, and a sheen that sweeps across (uSweep).
const gloss = new T.ShaderMaterial(Object.assign({
uniforms: { uRim: { value: new T.Color(0x9DB2FF) }, uSweep: { value: -99 } },
vertexShader: VERT,
fragmentShader: [
"uniform vec3 uRim; uniform float uSweep; varying vec3 vN; varying vec3 vV; varying vec3 vP;",
"void main() {",
"  vec3 n = normalize(vN), v = normalize(vV);",
"  float ndv = clamp(abs(dot(n, v)), 0.0, 1.0);",
"  vec3 h2 = normalize(normalize(vec3(-0.7, -0.3, 0.5)) + v);",
"  float s1 = pow(max(dot(n, normalize(vec3(0.2, 0.75, 0.63))), 0.0), 26.0), s2 = pow(max(dot(n, h2), 0.0), 20.0);",
"  float s3 = pow(max(dot(n, normalize(vec3(-0.8, 0.12, 0.59))), 0.0), 34.0);",
"  float face = pow(max(dot(n, normalize(vec3(0.26, 0.08, 0.96))), 0.0), 120.0);",
"  float across = (vP.x - vP.y) * 0.7071 - uSweep;",   // squared by hand: pow() of a negative number is undefined on some graphics cards
"  float band = exp(-across * across / 0.2) * smoothstep(0.55, 0.9, ndv);",
"  vec3 col = vec3(1.0, 0.8, 0.52) * s1 * 0.6 + vec3(0.62, 0.9, 1.0) * s3 * 0.5 + uRim * (s2 * 0.3 + band * 0.26 + face * 0.1);",
"  gl_FragColor = vec4(col, 1.0);",
"}"].join("\n")
}, ADD));
const back = new T.Mesh(slabGeo, glassBody(.2, T.BackSide)); back.renderOrder = -1;
// The glass marks where it is (stencil), so light passing in front of it can be drawn again at full strength.
const glass = glassBody(.36, T.FrontSide);
glass.polygonOffset = true; glass.polygonOffsetFactor = 1; glass.polygonOffsetUnits = 1;
glass.stencilWrite = true; glass.stencilRef = 1; glass.stencilFunc = T.AlwaysStencilFunc; glass.stencilZPass = T.ReplaceStencilOp;
const body = new T.Mesh(slabGeo, glass);
const shine = new T.Mesh(slabGeo, gloss); shine.renderOrder = 3;
const cuts = new T.EdgesGeometry(slabGeo, 10);
const edges = new T.LineSegments(cuts, new T.LineBasicMaterial({ color: 0xA9BCFF, transparent: true, opacity: .85 })); edges.renderOrder = 4;
// the far cuts, seen dimly through the glass
const farEdges = new T.LineSegments(cuts, new T.LineBasicMaterial({ color: 0xA9BCFF, transparent: true, opacity: .3, depthWrite: false })); farEdges.renderOrder = -1;
holder.add(farEdges, back, body, shine, edges);
// sparkles that wink on the corners of the cut, like the ones in the level
const starTex = canvasTex(64, 64, g => {
g.translate(32, 32);
for (const turn of [0, Math.PI / 2]) {
g.save(); g.rotate(turn);
const l = g.createLinearGradient(-30, 0, 30, 0); l.addColorStop(0, "rgba(255,255,255,0)"); l.addColorStop(.5, "rgba(255,255,255,1)"); l.addColorStop(1, "rgba(255,255,255,0)");
g.fillStyle = l; g.beginPath(); g.moveTo(-30, 0); g.lineTo(0, -2.2); g.lineTo(30, 0); g.lineTo(0, 2.2); g.closePath(); g.fill();
g.restore();
}
const r = g.createRadialGradient(0, 0, 0, 0, 0, 9); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(1, "rgba(255,255,255,0)");
g.fillStyle = r; g.fillRect(-9, -9, 18, 18);
});
const TX = W / 2 - BEV, TY = H / 2 - BEV, TZ = DEPTH / 2;
const winks = [[-TX + CUT, TY, 1.9, 0], [TX, TY - CUT, 2.6, 2.1], [TX - CUT, -TY, 2.2, 4.0], [-TX, -TY + CUT, 3.1, 5.2], [-W / 2 + .02, .2, 2.4, 1.2]].map(([x, y, pace, phase]) => {
const star = new T.Sprite(new T.SpriteMaterial(Object.assign({ map: starTex, color: 0xEAF0FF, opacity: 0 }, ADD)));
star.position.set(x, y, TZ + .01); star.renderOrder = 6; holder.add(star);
return { star, pace, phase };
});
// ---------- inside the glass: the game ----------
// Everything inside is drawn over the glass (no depth test), at its own depth so it shifts as the block turns.
const INSIDE = { transparent: true, depthTest: false, depthWrite: false };
const boardGeo = new T.ShapeGeometry(roundedRect(SW, SH, .05), 6);
(function () {
const uv = boardGeo.attributes.uv, pos = boardGeo.attributes.position;
for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / SW + .5, pos.getY(i) / SH + .5);
})();
const Z_BOARD = -.17, Z_TRAIL = -.05;
const dark = new T.Mesh(boardGeo, new T.MeshBasicMaterial(Object.assign({ color: 0x0B0A1E }, INSIDE))); dark.position.z = Z_BOARD; dark.renderOrder = 1;
const boardTex = new T.Texture(); boardTex.anisotropy = 8;
const board = new T.Mesh(boardGeo, new T.MeshBasicMaterial(Object.assign({ map: boardTex, color: 0xF0F0F6 }, INSIDE))); board.position.z = Z_BOARD; board.renderOrder = 1; board.visible = false;
holder.add(dark, board);
const picture = new Image();
picture.onload = () => { boardTex.image = picture; boardTex.needsUpdate = true; board.visible = true; parts.redraw(); };
picture.crossOrigin = "anonymous";   // the picture comes from the CDN; without this it could not become a texture
picture.src = parts.backdrop;
const toLocal = (x, y) => [(x / BOARD_W - .5) * SW, (.5 - y / BOARD_H) * SH];
// A trail: a flat strip that follows the corner points, with square joins. The shader lights it up to where its rider is.
function track(points, fragment) {
const n = points.length, P = points.map(p => toLocal(p[0], p[1])), dist = [0], HW = .05;   // narrower than half the shortest piece, so tight turns don't fold
for (let i = 1; i < n; i++) dist.push(dist[i - 1] + Math.abs(points[i][0] - points[i - 1][0]) + Math.abs(points[i][1] - points[i - 1][1]));
const pos = [], side = [], along = [], index = [];
const dir = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
for (let i = 0; i < n; i++) {
const before = i > 0 ? dir(P[i - 1], P[i]) : dir(P[0], P[1]), after = i < n - 1 ? dir(P[i], P[i + 1]) : before;
const n0 = [-before[1], before[0]], n1 = [-after[1], after[0]];
let mx = n0[0] + n1[0], my = n0[1] + n1[1]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
const k = HW / Math.max(.3, mx * n1[0] + my * n1[1]);
pos.push(P[i][0] + mx * k, P[i][1] + my * k, 0, P[i][0] - mx * k, P[i][1] - my * k, 0);
side.push(1, -1); along.push(dist[i], dist[i]);
if (i < n - 1) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
}
const geo = new T.BufferGeometry();
geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
geo.setAttribute("aSide", new T.Float32BufferAttribute(side, 1));
geo.setAttribute("aDist", new T.Float32BufferAttribute(along, 1));
geo.setIndex(index);
const material = new T.ShaderMaterial(Object.assign({
uniforms: { uHead: { value: 0 }, uTail: { value: -1e6 }, uFade: { value: 1 }, uTime: { value: 0 }, uHot: { value: 0 } },
vertexShader: "attribute float aSide; attribute float aDist; varying float vSide; varying float vDist;\nvoid main() { vSide = aSide; vDist = aDist; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
fragmentShader: fragment, side: T.DoubleSide
}, ADD, { depthTest: false }));
const mesh = new T.Mesh(geo, material); mesh.position.z = Z_TRAIL; mesh.renderOrder = 2; mesh.frustumCulled = false;
holder.add(mesh);
// where the rider is at a given second: position, and how far it has gone
function at(seconds) {
let i = 0; while (i < n - 2 && points[i + 1][2] <= seconds) i++;
const a = points[i], b = points[i + 1], f = clamp01((seconds - a[2]) / Math.max(1e-6, b[2] - a[2]));
const p = toLocal(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
return { x: p[0], y: p[1], dist: dist[i] + (dist[i + 1] - dist[i]) * f };
}
return { material, at, end: P[n - 1] };
}
const SHAPE = "  float a = abs(vSide), core = 1.0 - smoothstep(0.4, 0.56, a), halo = exp(-a * a * 3.0) * (1.0 - smoothstep(0.8, 1.0, a));";
// The player's trail: the game's cyan line.
const player = track(ROUND.player, [
"uniform float uHead; uniform float uFade; varying float vSide; varying float vDist;",
"void main() {",
"  if (vDist > uHead) discard;",
SHAPE,
"  float nearHead = exp(-(uHead - vDist) / 70.0);",
"  vec3 col = vec3(0.157, 0.843, 1.0) * (halo * 0.5 + core * 0.9) + vec3(1.0) * core * (0.1 + 0.5 * nearHead);",
"  gl_FragColor = vec4(col * uFade, 1.0);",
"}"].join("\n"));
// The Prism's trail, as in the game: blocks of two tones, a rainbow pulse running along it,
// only its last stretch stays lit, and it turns pink when The Prism is enraged (uHot).
const prism = track(ROUND.prism, [
"uniform float uHead; uniform float uTail; uniform float uFade; uniform float uTime; uniform float uHot; varying float vSide; varying float vDist;",
"vec3 rainbow(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }",
"void main() {",
"  if (vDist > uHead) discard;",
"  float keep = smoothstep(uTail, uTail + 70.0, vDist);",
"  if (keep <= 0.0) discard;",
SHAPE,
"  float tone = mod(floor(vDist / 18.0), 2.0);",
"  vec3 block = mix(mix(vec3(0.643, 0.549, 0.941), vec3(0.945, 0.925, 1.0), tone), mix(vec3(1.0, 0.62, 0.87), vec3(1.0), tone), uHot);",
"  float fromHead = uHead - vDist, lit = min(uHead, " + PRISM_TRAIL.toFixed(1) + ");",
"  float pulseAt = mod(uTime * mix(220.0, 420.0, uHot), lit + 240.0) - 120.0, gap = abs(fromHead - pulseAt);",
"  vec3 hue = mix(vec3(1.0), rainbow(fract((fromHead - pulseAt + 60.0) / 144.0)), 0.56);",
"  vec3 coreCol = mix(block, hue, 0.75 * (1.0 - smoothstep(0.0, 60.0, gap)));",
"  vec3 glow = mix(vec3(0.59, 0.39, 1.0), vec3(1.0, 0.47, 0.86), uHot);",
"  gl_FragColor = vec4((glow * halo * 0.5 + coreCol * core * 0.8) * uFade * keep, 1.0);",
"}"].join("\n"));
const inside = (sprite, z) => { sprite.material.depthTest = false; sprite.renderOrder = 2; sprite.position.z = z; holder.add(sprite); return sprite; };
const riderGlow = inside(glowDot(CYAN, .46), Z_TRAIL), rider = inside(glowDot(0xFFFFFF, .17), Z_TRAIL + .01);
const gemGlow = inside(glowDot(VIOLET, .62), Z_TRAIL);
const gem = inside(new T.Sprite(new T.SpriteMaterial({ map: gemTex, transparent: true, depthWrite: false })), Z_TRAIL + .01); gem.scale.set(.2, .2, 1);
// The Prism shattering when it crashes.
const flash = inside(glowDot(0xFFFFFF, 1, 0), Z_TRAIL + .02);
const SHARDS = 30, shardDir = [], shardGeo = new T.BufferGeometry();
(function () {
let s = 77; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const tones = [0xFFFFFF, 0xE0D4FF, 0xB48CFF, 0xFF8AD8, 0x8AD8FF], colors = [], c = new T.Color();
for (let i = 0; i < SHARDS; i++) {
const a = rnd() * Math.PI * 2, v = .45 + rnd() * 1.15;
shardDir.push([Math.cos(a) * v, Math.sin(a) * v, (rnd() - .3) * .5]);
c.setHex(tones[i % tones.length]); colors.push(c.r, c.g, c.b);
}
shardGeo.setAttribute("position", new T.Float32BufferAttribute(new Float32Array(SHARDS * 3), 3));
shardGeo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
})();
const shards = new T.Points(shardGeo, new T.PointsMaterial(Object.assign({ map: dotTex, size: .2, vertexColors: true, opacity: 0 }, ADD, { depthTest: false })));
shards.renderOrder = 2; shards.frustumCulled = false; holder.add(shards);
// ---------- its cords: two lines of light with square turns, one in, one out ----------
// A path with small rounded corners through the given points.
function routed(points, r) {
const path = new T.CurvePath();
let from = points[0];
for (let i = 1; i < points.length - 1; i++) {
const corner = points[i];
const a = corner.clone().add(points[i - 1].clone().sub(corner).normalize().multiplyScalar(r));
const b = corner.clone().add(points[i + 1].clone().sub(corner).normalize().multiplyScalar(r));
path.add(new T.LineCurve3(from, a)); path.add(new T.QuadraticBezierCurve3(a, corner, b));
from = b;
}
path.add(new T.LineCurve3(from, points[points.length - 1]));
return path;
}
const gold = new T.MeshStandardMaterial({ color: 0xD9A85B, metalness: .4, roughness: .35, emissive: 0x8A5E18, emissiveIntensity: .95 });
function cord(points, base, tail, head, pulses) {
const path = routed(points, .16), tex = flowTex(base, tail, head);
tex.repeat.set(pulses, 1);
const tube = new T.Mesh(new T.TubeGeometry(path, 180, .03, 6, false), new T.MeshBasicMaterial(Object.assign({ map: tex }, ADD)));
tube.renderOrder = 6; holder.add(tube);
return { tex, pulses };
}
function port(x, y, color) {
const ring = new T.Mesh(new T.TorusGeometry(.085, .026, 10, 28), gold); ring.rotation.y = Math.PI / 2; ring.position.set(x, y, 0);
const light = glowDot(color, .5, .5); light.position.set(x, y, 0); light.renderOrder = 6;
holder.add(ring, light);
return light;
}
const IN_Y = .74, OUT_Y = -.52, EDGE = W / 2 + .03;
const cordIn = cord([v3(-3.5, 7.5, 0), v3(-3.5, IN_Y, 0), v3(-EDGE, IN_Y, 0)], "#0E5670", "#22B4E0", "#B4EEFF", 2.5);
const cordOut = cord([v3(EDGE, OUT_Y, 0), v3(3.42, OUT_Y, 0), v3(3.42, -7.5, 0)], "#3A2480", "#8A5CE8", "#E0D4FF", 2.5);
const portIn = port(-EDGE, IN_Y, CYAN), portOut = port(EDGE, OUT_Y, VIOLET);
// the warm light on the block's upper right corner
const flare = glowDot(0xFFD08A, 1.5, .5); flare.position.set(W / 2 - .12, H / 2 - .1, DEPTH / 2); flare.renderOrder = 6; holder.add(flare);
// ---------- ribbons of light around it ----------
const ribbons = [[3.6, 2.1, .52, -.3, .2, .2, "#1B7FA8", "#A8ECFF"], [3.1, 2.4, -.5, .5, -.25, -.27, "#5B3FB8", "#DCCBFF"], [4.0, 1.95, -.7, .1, .34, .15, "#B8842C", "#FFE2A8"], [2.9, 2.8, .95, -.2, -.1, .23, "#3B45B8", "#C2C8FF"]]
.map(([rx, rz, tx, ty, tz, speed, tail, head]) => {
const pts = []; for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; pts.push(v3(Math.cos(a) * rx, 0, Math.sin(a) * rz)); }
const tex = flowTex("#000", tail, head); tex.repeat.set(2, 1);
const tube = new T.TubeGeometry(new T.CatmullRomCurve3(pts, true), 220, .02, 6, true);
// drawn twice: behind the glass (the glass dims it), then again only where it passes in front of the glass
const behind = new T.Mesh(tube, new T.MeshBasicMaterial(Object.assign({ map: tex }, ADD))); behind.renderOrder = -2;
const front = new T.Mesh(tube, new T.MeshBasicMaterial(Object.assign({ map: tex, opacity: .7, stencilWrite: true, stencilRef: 1, stencilFunc: T.EqualStencilFunc }, ADD))); front.renderOrder = 5;
for (const m of [behind, front]) { m.rotation.set(tx, ty, tz); m.position.copy(CENTER); root.add(m); }
return { tex, speed };
});
const motes = dust(110, [10, 6, 5], 0xC9D2FF, .06, 7), sparks = dust(30, [10, 6, 5], GOLD, .085, 91);
root.add(motes, sparks);
// ---------- every frame ----------
// Hairlines are one pixel wide at any size, so on a small stage they are drawn fainter.
function size(pixels) {
const k = Math.max(0, Math.min(1, (pixels - 400) / 900));
sphere.material.opacity = .085 + .065 * k;
edges.material.opacity = .6 + .25 * k; farEdges.material.opacity = .18 + .12 * k;
}
const LOOP = ROUND.time + AFTER, crash = prism.end, shardPos = shardGeo.attributes.position;
const near = (x, target, width) => { const d = Math.abs(((x - target) % 1 + 1.5) % 1 - .5); return Math.exp(-Math.pow(d / width, 2)); };
function update(t, pointer) {
// the block: it sways on its own, less while the pointer is steering it
const own = 1 - .55 * pointer.over;
holder.rotation.y = (Math.sin(t * .5) * .34 - .05) * own + pointer.x * .22;
holder.rotation.x = Math.sin(t * .37 + 1) * .06 * own + pointer.y * .1;
holder.rotation.z = (Math.sin(t * .4) * .03 - .012) * own;
holder.position.y = CENTER.y + Math.sin(t * .8) * .06;
gloss.uniforms.uSweep.value = -4.5 + ((t * .16) % 1) * 24;   // a sheen crosses the glass every few seconds
// the round inside, replayed
const now = t % LOOP, play = Math.min(now, ROUND.time), over = now - ROUND.time;
const appear = clamp01(now / .35), p = player.at(play), q = prism.at(play);
const playerFade = over < 1.4 ? 1 : clamp01(1 - (over - 1.4) / .7), prismFade = over < 0 ? 1 : clamp01(1 - over / .7);
player.material.uniforms.uHead.value = p.dist; player.material.uniforms.uFade.value = playerFade;
prism.material.uniforms.uHead.value = q.dist; prism.material.uniforms.uTail.value = q.dist - PRISM_TRAIL;
prism.material.uniforms.uFade.value = prismFade; prism.material.uniforms.uTime.value = t;
prism.material.uniforms.uHot.value = clamp01((play - ENRAGE_AT) / .3);
riderGlow.position.x = rider.position.x = p.x; riderGlow.position.y = rider.position.y = p.y;
riderGlow.material.opacity = .9 * appear * playerFade; rider.material.opacity = appear * playerFade;
gemGlow.position.x = gem.position.x = q.x; gemGlow.position.y = gem.position.y = q.y;
const alive = over < 0 ? appear : 0;
gem.material.opacity = alive; gemGlow.material.opacity = .8 * alive; gem.material.rotation = -t * .6;
gemGlow.material.color.setHex(play >= ENRAGE_AT ? 0xFF78E6 : VIOLET);
// the crash: a flash and shards flying off
const k = over < 0 ? -1 : over / 1.1;
flash.position.x = crash[0]; flash.position.y = crash[1];
if (k >= 0 && k < 1) {
const ease = 1 - Math.pow(1 - k, 3);
flash.material.opacity = Math.pow(1 - k, 2); flash.scale.setScalar(.4 + ease * 2.2);
for (let i = 0; i < SHARDS; i++) shardPos.setXYZ(i, crash[0] + shardDir[i][0] * ease, crash[1] + shardDir[i][1] * ease, shardDir[i][2] * ease);
shardPos.needsUpdate = true; shards.material.opacity = Math.pow(1 - k, 1.5);
} else { flash.material.opacity = 0; shards.material.opacity = 0; }
// the cords: light runs in through one and out through the other; each port glows as a pulse crosses it
cordIn.tex.offset.x = -t * .5; cordOut.tex.offset.x = -t * .5;
portIn.material.opacity = .35 + .65 * near(cordIn.pulses - t * .5, .975, .06);
portOut.material.opacity = .35 + .65 * near(-t * .5, .975, .06);
flare.material.opacity = .42 + .14 * Math.sin(t * 1.5);
winks.forEach(w => {
const on = Math.pow(Math.max(0, Math.sin(t * w.pace + w.phase)), 10);
w.star.material.opacity = .85 * on; w.star.scale.setScalar(.2 + .34 * on); w.star.material.rotation = t * .3;
});
ribbons.forEach(r => { r.tex.offset.x = -t * r.speed; });
shapeSphere(t);
sphere.rotation.y = t * .05; sphere.rotation.x = t * .02;
motes.rotation.y = t * .03; sparks.rotation.y = -t * .04; motes.position.y = Math.sin(t * .2) * .2;
}
return { update, size };
}
function mount(stage, options) {
options = options || {};
const T = global.THREE, glCanvas = stage.querySelector(".gl"), bloom = stage.querySelector(".bloom");
const fail = () => { stage.classList.add("no-gl"); return null; };
if (!T || !glCanvas) return fail();
let renderer;
try { renderer = new T.WebGLRenderer({ canvas: glCanvas, antialias: true, stencil: true }); } catch (e) { return fail(); }
renderer.setClearColor(STAGE, 1);
const reduce = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
const scene = new T.Scene(), camera = new T.PerspectiveCamera(30, 1.6, .1, 60), root = new T.Group();
scene.add(root);
const st = { drawn: false, seen: true, tx: 0, ty: 0, x: 0, y: 0, hover: 0, over: 0 };
const object = build(T, { scene, root, camera, backdrop: options.backdrop, redraw: () => { st.drawn = false; } });
const pen = bloom ? bloom.getContext("2d") : null;
const card = options.hover || stage;
const move = e => { const r = card.getBoundingClientRect(); st.tx = ((e.clientX - r.left) / r.width - .5) * 2; st.ty = ((e.clientY - r.top) / r.height - .5) * 2; st.hover = 1; };
const leave = () => { st.tx = 0; st.ty = 0; st.hover = 0; };
card.addEventListener("pointermove", move);
for (const type of ["pointerleave", "pointercancel"]) card.addEventListener(type, leave);
function fit() {
const r = { width: stage.clientWidth, height: stage.clientHeight };   // layout size: the gallery may be turning the card
if (!r.width || !r.height) return;
renderer.setPixelRatio(Math.min(1.5, global.devicePixelRatio || 1));
renderer.setSize(r.width, r.height, false);
camera.aspect = r.width / r.height;
camera.position.z = 11 * Math.max(1, 1.6 / camera.aspect);   // a narrower stage steps back so nothing is cut off
camera.updateProjectionMatrix();
object.size(r.width * renderer.getPixelRatio());
if (bloom) {
bloom.width = Math.max(2, Math.round(r.width / 2)); bloom.height = Math.max(2, Math.round(r.height / 2));
bloom.style.filter = "blur(" + (r.width / 80).toFixed(1) + "px) brightness(1.45) saturate(1.25)";   // the glow keeps its proportion at any size
}
st.drawn = false;
}
let frame = 0;
function paint(now) {
frame = global.requestAnimationFrame(paint);
if (st.drawn && (reduce || !st.seen || document.hidden)) return;
const t = reduce ? 4.9 : now / 1000;   // with reduced motion: one still frame, mid-round
st.x += (st.tx - st.x) * .07; st.y += (st.ty - st.y) * .07; st.over += (st.hover - st.over) * .06;
root.rotation.y = st.x * .3; root.rotation.x = st.y * .16;
object.update(t, { x: st.x, y: st.y, over: st.over });
renderer.render(scene, camera);
const lite = document.documentElement.classList.contains("lite");   // the page dropped its own glow on a slow device
if (bloom && bloom.hidden !== lite) bloom.hidden = lite;
if (pen && !lite) {   // the glow is this same frame, blurred; multiplied by itself so only the bright parts glow
pen.globalCompositeOperation = "copy"; pen.drawImage(renderer.domElement, 0, 0, bloom.width, bloom.height);
pen.globalCompositeOperation = "multiply"; pen.drawImage(renderer.domElement, 0, 0, bloom.width, bloom.height);
}
st.drawn = true;
}
fit();
global.addEventListener("resize", fit);
const sizer = "ResizeObserver" in global ? new ResizeObserver(fit) : null;
if (sizer) sizer.observe(stage);
let watcher = null;
if ("IntersectionObserver" in global) {
watcher = new IntersectionObserver(list => list.forEach(e => { st.seen = e.isIntersecting; }), { rootMargin: "120px" });
watcher.observe(stage);
}
frame = global.requestAnimationFrame(paint);
return {
fit,
dispose() {
global.cancelAnimationFrame(frame); global.removeEventListener("resize", fit);
card.removeEventListener("pointermove", move);
for (const type of ["pointerleave", "pointercancel"]) card.removeEventListener(type, leave);
if (watcher) watcher.disconnect();
if (sizer) sizer.disconnect();
renderer.dispose();
}
};
}
global.VanragedonGlass = { mount };
})(window);