// ══════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════
// Scene content and UI metadata are loaded from /api/scene-config so the
// frontend reads the same shared scene records as the backend.

const LEVEL_NAMES = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };
const LEVEL_UI_META = {
  1: { label: 'Beginner', cls: 'beg', desc: 'Short, clear lines. Get comfortable speaking on camera.' },
  2: { label: 'Intermediate', cls: 'int', desc: 'Longer phrases, rhythm, and emotion start to matter.' },
  3: { label: 'Advanced', cls: 'adv', desc: 'Accent precision and raw delivery. The real challenge begins.' },
};

let LEVEL_MAP = {};
let CLV_LEVELS = [];
let DEFAULT_UNLOCKED_SCENES = [];

const DIVISIONS = [
  { name: 'Bronze',   min: 0,     max: 499,   color: '#cd7f32' },
  { name: 'Silver',   min: 500,   max: 1999,  color: '#b8b8b8' },
  { name: 'Gold',     min: 2000,  max: 4999,  color: '#c9a84c' },
  { name: 'Diamond',  min: 5000,  max: 9999,  color: '#67e8f9' },
  { name: 'Director', min: 10000, max: null,  color: '#c9a84c' },
];

function getDivision(points) {
  for (let i = DIVISIONS.length - 1; i >= 0; i--) {
    if (points >= DIVISIONS[i].min) return DIVISIONS[i];
  }
  return DIVISIONS[0];
}

const APP_BASE = (window.MIRROR_APP_BASE || '').replace(/\/$/, '');
const API = APP_BASE;

function resolveAppUrl(path) {
  if (!path) return path;
  return new URL(path, window.location.origin).toString();
}

function applySceneConfig(config) {
  scenes = (config && config.scenes) ? config.scenes : {};
  const levels = Array.isArray(config && config.levels) ? config.levels : [];
  LEVEL_MAP = {};
  CLV_LEVELS = levels.map(lv => {
    const sceneIds = Array.isArray(lv.scenes) ? lv.scenes.slice() : [];
    const meta = LEVEL_UI_META[lv.level] || {};
    sceneIds.forEach(sid => { LEVEL_MAP[sid] = lv.level; });
    return {
      level: lv.level,
      label: meta.label || `Level ${lv.level}`,
      cls: meta.cls || '',
      unlock: lv.unlock_score,
      desc: meta.desc || '',
      scenes: sceneIds,
    };
  });
  DEFAULT_UNLOCKED_SCENES = CLV_LEVELS.length ? CLV_LEVELS[0].scenes.slice() : [];
  if (!userProgress.unlocked_scenes || !userProgress.unlocked_scenes.length) {
    userProgress.unlocked_scenes = DEFAULT_UNLOCKED_SCENES.slice();
  }
}

let sceneConfigPromise = null;

function ensureSceneConfig() {
  if (!sceneConfigPromise) {
    sceneConfigPromise = (async () => {
      const r = await fetch(`${API}/api/scene-config`);
      if (!r.ok) throw new Error('Failed to load scene config');
      const data = await r.json();
      applySceneConfig(data);
      return data;
    })().catch(err => {
      sceneConfigPromise = null;
      throw err;
    });
  }
  return sceneConfigPromise;
}

function getDefaultUnlockedScenes() {
  return DEFAULT_UNLOCKED_SCENES.slice();
}

function getSceneUiMeta(sceneId) {
  const scene = scenes[sceneId];
  const meta = scene && scene.ui;
  return (meta && typeof meta === 'object' && !Array.isArray(meta)) ? meta : {};
}

function getSceneColor(sceneId, fallback = '#c9a84c') {
  const color = getSceneUiMeta(sceneId).card_color;
  return (typeof color === 'string' && color.trim()) ? color : fallback;
}

function getSceneYouTubeId(sceneId) {
  const ytId = getSceneUiMeta(sceneId).youtube_id;
  return (typeof ytId === 'string') ? ytId.trim() : '';
}

function getSceneTimes(sceneId) {
  const meta = getSceneUiMeta(sceneId);
  const start = Number(meta.clip_start);
  const end = Number(meta.clip_end);
  if (Number.isFinite(start) && Number.isFinite(end)) return { start, end };
  return null;
}

function getScenePoster(sceneId) {
  const poster = getSceneUiMeta(sceneId).poster_image;
  return (typeof poster === 'string') ? poster : '';
}

// ══════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════
let authToken   = localStorage.getItem('mirror_token') || null;
let authUser    = null;

let scenes      = {};
let activeScene = null;
let activeLbTab = null;

let userProgress = {
  level: 1,
  best_scores: {},
  unlocked_scenes: [],
  next_level: { level: 2, required_score: 60, best_score: 0 },
};

let dailyChallenge    = null;
let countdownInterval = null;

let ytPlayer      = null;
let ytApiReady    = false;
let ytEndInterval = null;

let challengeCtx    = null;  // { score_to_beat } when scoring for a challenge
let activeChallenge = null;  // full challenge object when on challenge screen

window.onYouTubeIframeAPIReady = function() { ytApiReady = true; };

let mediaRecorder = null;
let audioChunks   = [];
let audioBlob     = null;
let audioEl       = null;
let micStream     = null;
let timerInterval = null;
let recSecs       = 0;

let waveAudioCtx   = null;
let waveAnalyser   = null;
let waveAnimFrame  = null;
const WAVE_BARS    = 48;

// ══════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════
(async () => {
  sceneConfigPromise = ensureSceneConfig();
  // Check if we're on a challenge URL first
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts[0] === 'challenge' && pathParts[1]) {
    await loadChallengePage(pathParts[1]);
    return;
  }
  if (authToken) {
    const ok = await verifyToken();
    if (ok) {
      showApp();
      await loadProgress();
      await Promise.all([loadScenes(), loadScores(), loadDaily(), loadStreakCard()]);
      return;
    }
  }
  showAuthScreen();
})();

// ══════════════════════════════════════════════
// AUTH — state helpers
// ══════════════════════════════════════════════
async function verifyToken() {
  try {
    const r = await fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!r.ok) throw new Error();
    authUser = await r.json();
    return true;
  } catch {
    clearAuth();
    return false;
  }
}

function showAuthScreen() {
  document.getElementById('authScreen').style.display     = '';
  document.getElementById('appScreen').style.display      = 'none';
  document.getElementById('challengeScreen').classList.remove('on');
  document.getElementById('authModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function showApp() {
  document.getElementById('authScreen').style.display     = 'none';
  document.getElementById('appScreen').style.display      = '';
  document.getElementById('challengeScreen').classList.remove('on');
  document.getElementById('userChipName').textContent = authUser.username;
  updateDivDot(0);  // default Bronze until profile loads
}

function updateDivDot(points) {
  const d   = getDivision(points);
  const dot = document.getElementById('divDot');
  dot.style.background = d.color;
  dot.title = d.name;
}

function clearAuth() {
  authToken = null;
  authUser  = null;
  localStorage.removeItem('mirror_token');
}

function logout() {
  clearAuth();
  scenes      = {};
  activeLbTab = null;
  showAuthScreen();
}

document.getElementById('btnLogout').addEventListener('click', logout);

// ══════════════════════════════════════════════
// AUTH — modal open / close
// ══════════════════════════════════════════════
function openAuthModal(tab) {
  switchAuthTab(tab || 'login');
  document.getElementById('authModalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeAuthModal() {
  document.getElementById('authModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('authModalClose').addEventListener('click', closeAuthModal);
document.getElementById('authModalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('authModalOverlay')) closeAuthModal();
});

document.getElementById('navLoginBtn').addEventListener('click',     () => openAuthModal('login'));
document.getElementById('navRegisterBtn').addEventListener('click',  () => openAuthModal('register'));
document.getElementById('heroStartBtn').addEventListener('click',    () => openAuthModal('register'));
document.getElementById('pricingFreeBtn').addEventListener('click',  () => openAuthModal('register'));
document.getElementById('pricingProBtn').addEventListener('click',   () => openAuthModal('register'));

// ══════════════════════════════════════════════
// AUTH — tab switching
// ══════════════════════════════════════════════
document.getElementById('tabLoginBtn').addEventListener('click', () => switchAuthTab('login'));
document.getElementById('tabRegBtn').addEventListener('click',   () => switchAuthTab('register'));

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tabLoginBtn').classList.toggle('active',  isLogin);
  document.getElementById('tabRegBtn').classList.toggle('active',   !isLogin);
  document.getElementById('loginForm').classList.toggle('hidden',   !isLogin);
  document.getElementById('registerForm').classList.toggle('hidden', isLogin);
  document.getElementById('loginError').textContent    = '';
  document.getElementById('registerError').textContent = '';
}

// ══════════════════════════════════════════════
// AUTH — login
// ══════════════════════════════════════════════
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  const btn      = document.getElementById('loginSubmit');

  errEl.textContent = '';
  btn.disabled      = true;
  btn.textContent   = 'Signing in\u2026';

  try {
    const r    = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || 'Login failed');

    authToken = data.access_token;
    authUser  = { username: data.username };
    localStorage.setItem('mirror_token', authToken);
    showApp();
    await loadProgress();
    await Promise.all([loadScenes(), loadScores(), loadDaily(), loadStreakCard()]);
    if (activeChallenge) enterChallengeFromAuth();
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Sign In';
  }
});

// ══════════════════════════════════════════════
// AUTH — register
// ══════════════════════════════════════════════
document.getElementById('registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.getElementById('regUsername').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm  = document.getElementById('regConfirm').value;
  const errEl    = document.getElementById('registerError');
  const btn      = document.getElementById('registerSubmit');

  errEl.textContent = '';

  if (password !== confirm) {
    errEl.textContent = 'Passwords do not match';
    const el = document.getElementById('regConfirm');
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Creating account\u2026';

  try {
    const r    = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || 'Registration failed');

    authToken = data.access_token;
    authUser  = { username: data.username };
    localStorage.setItem('mirror_token', authToken);
    showApp();
    if (!activeChallenge) maybeShowOnboarding();
    await loadProgress();
    await Promise.all([loadScenes(), loadScores(), loadDaily(), loadStreakCard()]);
    if (activeChallenge) enterChallengeFromAuth();
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Create Account';
  }
});

// ══════════════════════════════════════════════
// SCENES
// ══════════════════════════════════════════════
async function loadScenes() {
  try {
    await ensureSceneConfig();
  } catch {
    return;
  }
  renderCards();
  updateLevelCardStats();
}

function renderCards() {
  const grids = {
    Beginner:     document.getElementById('gridBeginner'),
    Intermediate: document.getElementById('gridIntermediate'),
    Advanced:     document.getElementById('gridAdvanced'),
  };
  // Clear all grids
  Object.values(grids).forEach(g => { if (g) g.innerHTML = ''; });

  for (const [id, s] of Object.entries(scenes)) {
    const target = grids[s.difficulty] || grids.Beginner;
    target.appendChild(makeCard(id, s));
  }

  // Show unlock hint on locked level headers
  const nextLevel = userProgress.next_level;
  const lockInter = document.getElementById('lockIntermediate');
  const lockAdv   = document.getElementById('lockAdvanced');
  if (lockInter) lockInter.textContent = userProgress.level >= 2 ? '' : 'Unlock at 60%';
  if (lockAdv)   lockAdv.textContent   = userProgress.level >= 3 ? '' : 'Unlock at 70%';
}

function makeCard(id, s) {
  const locked  = !userProgress.unlocked_scenes.includes(id);
  const isDaily = dailyChallenge && dailyChallenge.scene_id === id;
  const color   = locked ? 'var(--muted)' : getSceneColor(id);
  const pb      = !locked && userProgress.best_scores[id];
  const el      = document.createElement('div');
  el.className  = 'scene-card' + (locked ? ' locked' : '') + (isDaily ? ' daily' : '');
  el.style.setProperty('--c', color);
  el.innerHTML = `
    ${isDaily ? '<div class="daily-card-badge">&#9733; Daily Challenge &nbsp;&bull;&nbsp; 2&times; pts</div>' : ''}
    ${locked ? `
    <div class="lock-overlay">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <span>Level ${LEVEL_MAP[id]} Required</span>
    </div>` : ''}
    <div class="card-top" ${isDaily ? 'style="margin-top:18px"' : ''}>
      <span class="movie-year">${s.year}</span>
      <div style="display:flex;gap:6px;align-items:center">
        ${s.mature ? '<span class="badge mature">18+</span>' : ''}
        <span class="badge ${s.difficulty.toLowerCase()}">${s.difficulty}</span>
      </div>
    </div>
    ${pb ? `<div class="pb-badge-row"><span class="pb-badge">&#11088; PB: ${Math.round(pb)}%</span></div>` : ''}
    <div class="card-movie">${s.movie}</div>
    <div class="card-quote">&ldquo;${s.quote}&rdquo;</div>
    <div class="card-foot">
      <span class="card-actor">${s.actor}</span>
      <span class="card-cta">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        ${locked ? 'Locked' : 'Open Scene'}
      </span>
    </div>`;
  if (!locked) el.addEventListener('click', () => openModal(id, s));
  return el;
}

// ══════════════════════════════════════════════
// LEVEL SYSTEM
// ══════════════════════════════════════════════
async function loadProgress() {
  try {
    const r = await fetch(`${API}/api/progress`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (r.ok) userProgress = await r.json();
  } catch { /* keep defaults so offline dev still works */ }
  renderLevelBar();
}

async function loadDaily() {
  try {
    const r = await fetch(`${API}/api/daily`);
    if (!r.ok) return;
    dailyChallenge = await r.json();
    renderDailyCard(dailyChallenge);
    startDailyCountdown(dailyChallenge.secs_until_reset);
    if (Object.keys(scenes).length) renderCards();
  } catch { /* silent — section stays hidden */ }
}

function renderDailyCard(daily) {
  const s = daily.scene || scenes[daily.scene_id] || {};
  document.getElementById('dcMovie').textContent = s.movie || daily.scene_id;
  document.getElementById('dcQuote').textContent = s.quote ? `\u201c${s.quote}\u201d` : '';
  document.getElementById('dcActor').textContent = s.actor || '';
  const lvlEl = document.getElementById('dcLevel');
  lvlEl.textContent = s.difficulty || '';
  lvlEl.className   = `badge ${(s.difficulty || '').toLowerCase()}`;
  document.getElementById('dailySection').classList.add('on');
}

function startDailyCountdown(initialSecs) {
  if (countdownInterval) clearInterval(countdownInterval);
  let secs = initialSecs;
  function tick() {
    if (secs < 0) secs = 0;
    const h  = Math.floor(secs / 3600);
    const m  = Math.floor((secs % 3600) / 60);
    const s  = secs % 60;
    const el = document.getElementById('dcCountdown');
    if (el) el.textContent =
      `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    if (secs === 0) { clearInterval(countdownInterval); loadDaily(); loadStreakCard(); return; }
    secs--;
  }
  tick();
  countdownInterval = setInterval(tick, 1000);
}

async function loadStreakCard() {
  try {
    const r = await fetch(`${API}/api/profile`, { headers: { Authorization: `Bearer ${authToken}` } });
    if (!r.ok) return;
    const prof = await r.json();
    renderStreakCard(prof.streak || 0, prof.daily_done_today || false);
    if (prof.daily_done_today) showDailyComplete('Completed today!');
  } catch {}
}

function renderStreakCard(streak, doneToday) {
  document.getElementById('streakNumber').textContent = streak;

  // Build 7-day dot indicators (index 0 = today, 6 = 6 days ago)
  const days = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const now  = new Date();
  const dotRow = document.getElementById('streakDotRow');
  dotRow.innerHTML = '';

  for (let i = 6; i >= 0; i--) {  // left = oldest, right = today
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dayLbl = days[d.getDay()];

    // Is this day "completed"?
    let completed = false;
    if (doneToday)  completed = i < streak;
    else            completed = i >= 1 && i <= streak;
    const isToday = i === 0;

    const dot = document.createElement('div');
    dot.className = 'streak-dot-col';
    const dotInner = document.createElement('div');
    dotInner.className = 'streak-dot' + (isToday ? ' today' : completed ? ' done' : '');
    dotInner.textContent = completed ? '\u2714' : (isToday ? '\u2605' : '');
    const dotLbl = document.createElement('div');
    dotLbl.className = 'streak-dot-lbl';
    dotLbl.textContent = dayLbl;
    dot.appendChild(dotInner);
    dot.appendChild(dotLbl);
    dotRow.appendChild(dot);
  }

  // Milestone message
  document.getElementById('streakMsg').textContent = streakMessage(streak, doneToday);
}

function streakMessage(streak, doneToday) {
  if (streak === 0 && !doneToday) return 'Complete today\u2019s challenge to start your streak!';
  if (!doneToday && streak > 0)   return `${streak}-day streak \u2014 complete today to keep it going \u2192`;
  if (streak === 1)  return 'Day 1 done! Come back tomorrow to build your streak.';
  if (streak < 3)    return `${4 - streak} more day${streak === 3 ? '' : 's'} to your 3-day milestone!`;
  if (streak < 7)    return `${7 - streak} more day${streak === 6 ? '' : 's'} to your 1-week milestone \uD83D\uDD25`;
  if (streak === 7)  return 'One full week! Incredible consistency \uD83C\uDF1F';
  if (streak < 14)   return `${14 - streak} days to your 2-week milestone!`;
  if (streak < 30)   return `${30 - streak} days to your 1-month milestone!`;
  return `\uD83C\uDFC6 Legendary ${streak}-day streak! You\u2019re unstoppable.`;
}

function showDailyComplete(ptsText) {
  const overlay = document.getElementById('dcCompleteOverlay');
  if (!overlay) return;
  document.getElementById('dcCompletePts').textContent = ptsText;
  overlay.style.display = '';
}

function renderLevelBar() {
  document.getElementById('levelNum').textContent = userProgress.level;
  const det = document.getElementById('levelDetails');
  const nl  = userProgress.next_level;

  if (!nl) {
    det.innerHTML = `<span class="level-maxed">&#127916; All scenes unlocked — you've reached the top level</span>`;
    return;
  }

  const pct = nl.required_score > 0
    ? Math.min(100, (nl.best_score / nl.required_score) * 100)
    : 100;

  det.innerHTML = `
    <div class="level-next-text">
      Score <strong>${nl.required_score}%</strong> on a
      <strong>${LEVEL_NAMES[userProgress.level]}</strong> scene to unlock
      <strong>Level ${nl.level}</strong>
    </div>
    <div class="level-track"><div class="level-fill" id="lvlFill"></div></div>
    <div class="level-score-text">
      Best: <strong>${nl.best_score}%</strong> &nbsp;/&nbsp; ${nl.required_score}% needed
    </div>`;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const fill = document.getElementById('lvlFill');
    if (fill) fill.style.width = `${pct}%`;
  }));
}

function showLevelUp(newLevel) {
  const t = document.createElement('div');
  t.className = 'level-up-toast';
  t.innerHTML = `
    <div class="level-up-title">Level ${newLevel} Unlocked!</div>
    <div class="level-up-sub">New scenes are now available</div>`;
  document.body.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('on')));
  setTimeout(() => {
    t.classList.remove('on');
    setTimeout(() => t.remove(), 400);
  }, 3200);
}

// ══════════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════════
function openModal(id, s) {
  activeScene = id;
  const color = getSceneColor(id);

  document.getElementById('modal').style.setProperty('--mc', color);
  document.getElementById('mYear').textContent  = s.year;
  document.getElementById('mTitle').textContent = s.movie;
  document.getElementById('mTitle').style.color = color;
  document.getElementById('mQuote').textContent = `\u201c${s.quote}\u201d`;
  document.querySelector('.target-quote').style.borderLeftColor = color;
  document.getElementById('btnAnalyze').style.background = color;

  const ytRaw    = getSceneYouTubeId(id);
  const frameDiv = document.getElementById('videoFrame');
  const ph       = document.getElementById('videoPlaceholder');
  stopEndCheck();
  hideReplayLine();
  if (ytRaw) {
    const videoId  = ytRaw.split('?')[0];
    const times    = getSceneTimes(id);
    const startSec = times ? times.start : 0;
    frameDiv.style.display = '';
    ph.style.display = 'none';
    if (ytApiReady) {
      initYTPlayer(videoId, startSec);
    } else {
      const waitId = setInterval(() => {
        if (!ytApiReady) return;
        clearInterval(waitId);
        initYTPlayer(videoId, startSec);
      }, 100);
    }
  } else {
    if (ytPlayer) ytPlayer.stopVideo();
    frameDiv.style.display = 'none';
    ph.style.display = 'flex';
  }

  // Show 2× badge if this is today's daily challenge
  const badge = document.getElementById('dailyModalBadge');
  if (dailyChallenge && id === dailyChallenge.scene_id) {
    badge.classList.add('on');
  } else {
    badge.classList.remove('on');
  }

  resetRec();
  document.getElementById('overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  document.body.style.overflow = '';
  stopRecordingCleanup();
  stopEndCheck();
  hideReplayLine();
  if (ytPlayer) ytPlayer.stopVideo();
  activeScene = null;
}

document.getElementById('btnClose').addEventListener('click', closeModal);
document.getElementById('overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('overlay')) closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('authModalOverlay').classList.contains('open')) {
    closeAuthModal();
  } else if (document.getElementById('progressOverlay').classList.contains('open')) {
    closeProgressDashboard();
  } else {
    closeModal();
  }
});

// ══════════════════════════════════════════════
// RECORDING
// ══════════════════════════════════════════════
function resetRec() {
  stopRecordingCleanup();
  audioBlob = null; audioChunks = [];
  if (audioEl) { audioEl.pause(); audioEl = null; }

  setBtn('btnRecord',  false, btnRecordHTML());
  setBtn('btnStop',    true);
  setBtn('btnPlay',    true, btnPlayHTML());
  setBtn('btnAnalyze', true);
  document.getElementById('recInd').classList.remove('on');
  document.getElementById('recTime').textContent = '0:00';
  document.getElementById('scorePanel').classList.remove('on');
  document.getElementById('pbCompare').classList.remove('on');
  document.getElementById('phonSection').style.display = 'none';
  document.getElementById('pbBanner').classList.remove('on');
  document.getElementById('perfectBadge').classList.remove('on');
  const ptsPanel = document.getElementById('ptsEarned');
  ptsPanel.classList.remove('on');
  const ex = ptsPanel.querySelector('.pts-extra');
  if (ex) ex.innerHTML = '';
  document.getElementById('transReveal').classList.remove('on');
  document.getElementById('challengeShare').classList.remove('on');
  document.getElementById('challengeResult').className = 'challenge-result';
  document.getElementById('analyzeLabel').textContent = 'Analyze';
  document.getElementById('spinner').classList.remove('on');
  stopWaveform();
}

function stopRecordingCleanup() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  clearInterval(timerInterval);
  stopWaveform();
}

document.getElementById('btnRecord').addEventListener('click', startRec);
document.getElementById('btnStop').addEventListener('click', stopRec);
document.getElementById('btnPlay').addEventListener('click', togglePlayback);
document.getElementById('btnAnalyze').addEventListener('click', analyze);

async function startRec() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      alert('Microphone access denied. Please allow microphone access in your browser settings and try again.');
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      alert('No microphone found. Please connect a microphone and try again.');
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      alert('Microphone is in use by another application. Please close other apps using the mic and try again.');
    } else {
      alert(`Could not access microphone: ${err.message}`);
    }
    return;
  }

  audioChunks = [];
  audioBlob = null;
  const mimeType = getSupportedMimeType();
  mediaRecorder = new MediaRecorder(micStream, mimeType ? { mimeType } : {});
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blobType = mediaRecorder.mimeType || mimeType || 'audio/webm';
    audioBlob = new Blob(audioChunks, { type: blobType });
    console.log('[Mirror] Recording stopped. Blob size:', audioBlob.size, 'type:', audioBlob.type, 'chunks:', audioChunks.length);
    if (audioBlob.size === 0) {
      alert('No audio was captured — the recording was empty. Please try again and speak clearly into your microphone.');
      audioBlob = null;
      setBtn('btnRecord',  false, btnRecordHTML());
      setBtn('btnPlay',    true,  btnPlayHTML());
      setBtn('btnAnalyze', true);
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
      return;
    }
    setBtn('btnPlay',    false, btnPlayHTML());
    setBtn('btnAnalyze', false);
    setBtn('btnRecord',  false, btnRecordHTML());
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  };

  mediaRecorder.start(100);
  startWaveform();
  setBtn('btnRecord', true);
  setBtn('btnStop',   false);
  document.getElementById('recInd').classList.add('on');

  recSecs = 0;
  timerInterval = setInterval(() => {
    recSecs++;
    const m = Math.floor(recSecs / 60), s = recSecs % 60;
    document.getElementById('recTime').textContent = `${m}:${s.toString().padStart(2,'0')}`;
    if (recSecs >= 30) stopRec();
  }, 1000);
}

function stopRec() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  clearInterval(timerInterval);
  stopWaveform();
  setBtn('btnStop', true);
  document.getElementById('recInd').classList.remove('on');
}

function togglePlayback() {
  if (!audioBlob) return;
  if (audioEl && !audioEl.paused) {
    audioEl.pause(); audioEl = null;
    setBtn('btnPlay', false, btnPlayHTML());
    return;
  }
  audioEl = new Audio(URL.createObjectURL(audioBlob));
  audioEl.play();
  audioEl.onended = () => { audioEl = null; setBtn('btnPlay', false, btnPlayHTML()); };
  setBtn('btnPlay', false, btnStopPlayHTML());
}

async function analyze() {
  if (!audioBlob || !activeScene) return;

  // Guard against uploading an empty blob
  console.log('[Mirror] Uploading blob — size:', audioBlob.size, 'type:', audioBlob.type);
  if (audioBlob.size === 0) {
    alert('Error: No audio was recorded. Please record again before analyzing.');
    return;
  }

  setBtn('btnAnalyze', true);
  setBtn('btnRecord',  true);
  document.getElementById('spinner').classList.add('on');
  document.getElementById('analyzeLabel').textContent = 'Analyzing\u2026';
  document.getElementById('scorePanel').classList.remove('on');

  const form = new FormData();
  form.append('scene_id', activeScene);
  const ext = audioBlob.type.includes('mp4') ? 'mp4' : audioBlob.type.includes('ogg') ? 'ogg' : 'webm';
  form.append('audio', audioBlob, `recording.${ext}`);

  try {
    const res = await fetch(`${API}/api/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: form,
    });

    if (res.status === 401) {
      clearAuth();
      closeModal();
      showAuthScreen();
      return;
    }

    if (!res.ok) {
      const e = await res.json().catch(() => ({ detail: 'Server error' }));
      throw new Error(e.detail);
    }

    const data      = await res.json();
    const prevLevel = userProgress.level;
    showScore(data);
    activeLbTab = activeScene;
    await Promise.all([loadScores(), loadProgress()]);
    renderCards();
    if (userProgress.level > prevLevel) showLevelUp(userProgress.level);
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    document.getElementById('spinner').classList.remove('on');
    document.getElementById('analyzeLabel').textContent = 'Analyze';
    setBtn('btnAnalyze', false);
    setBtn('btnRecord',  false, btnRecordHTML());
  }
}

// ══════════════════════════════════════════════
// SCORE DISPLAY
// ══════════════════════════════════════════════
function showScore(data) {
  const pct = data.sync_score;
  let color, msg;
  if      (pct >= 85) { color = '#06d6a0'; msg = 'Outstanding! \uD83C\uDFAC'; }
  else if (pct >= 65) { color = '#ffd166'; msg = 'Great take!'; }
  else if (pct >= 40) { color = '#f4a261'; msg = 'Keep practicing'; }
  else                { color = '#e63946'; msg = 'Try again'; }

  const panel = document.getElementById('scorePanel');
  panel.style.setProperty('--score-color', color);
  document.getElementById('scoreMsg').textContent  = msg;
  document.getElementById('cmpYou').textContent    = `\u201c${data.transcription}\u201d`;
  document.getElementById('cmpOrig').textContent   = `\u201c${data.expected}\u201d`;
  panel.classList.add('on');
  renderPhonemeBreakdown(data.expected, data.transcription);
  showPointsEarned(data);

  // Show playback compare buttons
  const pbCompare = document.getElementById('pbCompare');
  pbCompare.classList.add('on');
  const hasYt = !!getSceneYouTubeId(activeScene);
  document.getElementById('btnHearActor').disabled = !hasYt;

  animateNum(document.getElementById('scoreVal'), 0, pct, 900);
  requestAnimationFrame(() => {
    const bar = document.getElementById('scoreBar');
    bar.style.background = color;
    requestAnimationFrame(() => { bar.style.width = `${pct}%`; });
  });

  if (data.is_new_pb) {
    document.getElementById('pbBanner').classList.add('on');
    showPBBlast();
  }

  if (challengeCtx) {
    showChallengeResult(pct, challengeCtx.score_to_beat);
    challengeCtx = null;
  }
}

function showPBBlast() {
  const COLORS = ['#C9A84C', '#fff', '#06d6a0', '#ffd166', '#f4a261', '#67e8f9'];
  const el = document.createElement('div');
  el.className = 'pb-blast';
  let html = `<div class="pb-blast-text">&#11088; New Personal Best!</div>`;
  for (let i = 0; i < 70; i++) {
    const color = COLORS[i % COLORS.length];
    const left  = Math.random() * 100;
    const delay = Math.random() * 0.6;
    const dur   = 1.4 + Math.random() * 1.4;
    const size  = 6 + Math.floor(Math.random() * 6);
    html += `<div class="pb-confetti" style="left:${left}%;width:${size}px;height:${size}px;background:${color};animation-duration:${dur}s;animation-delay:${delay}s"></div>`;
  }
  el.innerHTML = html;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function animateNum(el, from, to, ms) {
  const start = performance.now();
  const tick = now => {
    const t = Math.min((now - start) / ms, 1);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function showPointsEarned(data) {
  if (data.is_perfect) {
    document.getElementById('perfectBadge').classList.add('on');
  }
  if (data.points_earned > 0 || data.total_points !== undefined) {
    document.getElementById('ptsAmount').textContent   = data.points_earned || 0;
    document.getElementById('ptsTotalVal').textContent = data.total_points  || 0;
    // Annotate daily bonus and streak inside the pts panel
    const ptsPanel = document.getElementById('ptsEarned');
    let extra = '';
    if (data.is_daily && data.daily_bonus > 0) {
      extra += `<div style="font-size:11px;color:var(--gold);margin-top:4px">&#9733; Daily 2&times; bonus +${data.daily_bonus}pts</div>`;
    }
    if (data.is_daily && data.streak > 0 && !data.daily_already_done) {
      extra += `<div style="font-size:11px;color:#fb923c;margin-top:2px">&#128293; ${data.streak}-day streak!</div>`;
    }
    if (extra) {
      let extraEl = ptsPanel.querySelector('.pts-extra');
      if (!extraEl) { extraEl = document.createElement('div'); extraEl.className = 'pts-extra'; ptsPanel.appendChild(extraEl); }
      extraEl.innerHTML = extra;
    }
    ptsPanel.classList.add('on');
    if (data.division) updateDivDot(data.total_points || 0);
  }
  if (data.translation_unlocked && data.translation) {
    document.getElementById('transText').textContent = data.translation;
    document.getElementById('transReveal').classList.add('on');
  }
  // Show completion overlay on DC card if daily just completed
  if (data.is_daily && !data.daily_already_done) {
    showDailyComplete(`+${data.points_earned} pts earned today!`);
    renderStreakCard(data.streak || 0, true);
  }
}

// ══════════════════════════════════════════════
// LEADERBOARD
// ══════════════════════════════════════════════
async function loadScores() {
  try {
    await ensureSceneConfig();
    const r    = await fetch(`${API}/api/leaderboard`);
    if (!r.ok) return;
    const data = await r.json();
    renderLeaderboard(data);
  } catch { /* silent when API offline */ }
}

function renderLeaderboard(data) {
  const tabsEl   = document.getElementById('lbTabs');
  const panelsEl = document.getElementById('lbPanels');
  const sceneIds = Object.keys(scenes);

  tabsEl.innerHTML = panelsEl.innerHTML = '';
  if (!sceneIds.length) return;

  if (!activeLbTab || !sceneIds.includes(activeLbTab)) activeLbTab = sceneIds[0];

  for (const sid of sceneIds) {
    const s      = scenes[sid] || {};
    const color  = getSceneColor(sid);
    const rows   = data[sid] || [];
    const active = sid === activeLbTab;

    const tab = document.createElement('button');
    tab.className = 'lb-tab' + (active ? ' active' : '');
    tab.textContent = s.movie || sid;
    tab.style.setProperty('--tab-color', color);
    tab.addEventListener('click', () => switchTab(sid));
    tabsEl.appendChild(tab);

    const panel = document.createElement('div');
    panel.className = 'lb-panel' + (active ? ' active' : '');
    panel.id = `lb-panel-${sid}`;
    panel.innerHTML = buildPanelHTML(rows);
    panelsEl.appendChild(panel);
  }
}

function switchTab(sid) {
  activeLbTab = sid;
  const ids = Object.keys(scenes);
  document.querySelectorAll('.lb-tab').forEach((t, i)  => t.classList.toggle('active', ids[i] === sid));
  document.querySelectorAll('.lb-panel').forEach(p => p.classList.toggle('active', p.id === `lb-panel-${sid}`));
}

function buildPanelHTML(rows) {
  if (!rows.length)
    return `<div style="color:var(--muted);text-align:center;padding:36px 14px;font-size:13px">No scores yet — be the first!</div>`;

  const MEDAL = ['', '🥇', '🥈', '🥉'];
  const RCLS  = ['', 'gold', 'silver', 'bronze'];

  const trs = rows.map((s, i) => {
    const rank  = i + 1;
    const c     = s.sync_score >= 85 ? '#06d6a0' : s.sync_score >= 65 ? '#ffd166' : '#e63946';
    const div   = s.division || getDivision(s.user_points || 0);
    const badge = s.username
      ? `<span class="div-badge" style="background:${div.color}18;color:${div.color}">${div.name}</span>`
      : '';
    const streak = s.streak > 0
      ? ` <span class="streak-badge">&#128293;${s.streak}</span>`
      : '';
    const name  = s.username
      ? `<strong>${s.username}</strong> ${badge}${streak}`
      : `<span style="color:var(--muted)">\u2014</span>`;
    const pts = s.user_points
      ? `<span style="color:var(--muted);font-size:11px">${s.user_points}pts</span>`
      : '—';
    return `<tr>
      <td class="rank-num ${rank <= 3 ? RCLS[rank] : ''}" style="width:52px">${rank <= 3 ? MEDAL[rank] : rank}</td>
      <td>${name}</td>
      <td style="width:90px"><span class="chip" style="background:${c}18;color:${c}">${s.sync_score}%</span></td>
      <td style="width:72px;text-align:right">${pts}</td>
      <td style="color:var(--muted);white-space:nowrap;width:80px">${timeAgo(s.created_at)}</td>
    </tr>`;
  }).join('');

  return `<table class="lb-table">
    <thead><tr>
      <th style="width:52px">Rank</th><th>Name</th>
      <th style="width:90px">Score</th><th style="width:72px;text-align:right">Points</th>
      <th style="width:80px">When</th>
    </tr></thead>
    <tbody>${trs}</tbody>
  </table>`;
}

// ══════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════
function getSupportedMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function timeAgo(str) {
  if (!str) return '\u2014';
  const diff = Math.floor((Date.now() - new Date(str)) / 1000);
  if (diff <    60) return 'just now';
  if (diff <  3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(str).toLocaleDateString();
}

function setBtn(id, disabled, html) {
  const el = document.getElementById(id);
  el.disabled = disabled;
  if (html !== undefined) el.innerHTML = html;
}

function btnRecordHTML()   { return `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/></svg> Record`; }
function btnPlayHTML()     { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Playback`; }
function btnStopPlayHTML() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Stop`; }

// ══════════════════════════════════════════════
// ONBOARDING
// ══════════════════════════════════════════════
function maybeShowOnboarding() {
  if (localStorage.getItem('mirror_onboarded')) return;

  const screen = document.getElementById('onboardScreen');
  screen.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => screen.classList.add('visible')));

  screen.querySelectorAll('.onboard-step').forEach((step, i) => {
    setTimeout(() => step.classList.add('in'), 420 + i * 160);
  });
}

document.getElementById('btnStartActing').addEventListener('click', () => {
  localStorage.setItem('mirror_onboarded', '1');
  const screen = document.getElementById('onboardScreen');
  screen.classList.add('out');
  setTimeout(() => screen.remove(), 580);
});

// ══════════════════════════════════════════════
// LANDING PAGE — cursor, nav, scroll animations
// ══════════════════════════════════════════════

// Custom cursor
const cursorDot = document.getElementById('cursorDot');
document.addEventListener('mousemove', e => {
  cursorDot.style.left = e.clientX + 'px';
  cursorDot.style.top  = e.clientY + 'px';
});

// Nav scroll effect
window.addEventListener('scroll', () => {
  document.getElementById('siteNav').classList.toggle('scrolled', window.scrollY > 50);
}, { passive: true });

// Hamburger menu
document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('navLinks').classList.toggle('open');
  document.getElementById('hamburger').classList.toggle('open');
});

// Close mobile nav on outside click
document.addEventListener('click', e => {
  const nav  = document.getElementById('navLinks');
  const hamb = document.getElementById('hamburger');
  if (nav.classList.contains('open') && !nav.contains(e.target) && !hamb.contains(e.target)) {
    nav.classList.remove('open');
    hamb.classList.remove('open');
  }
});

// Smooth scroll for anchor links + close mobile nav
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('navLinks').classList.remove('open');
    document.getElementById('hamburger').classList.remove('open');
  });
});

// Fade-up scroll animations via IntersectionObserver
const fadeObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      fadeObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.fade-up').forEach(el => fadeObserver.observe(el));

// ══════════════════════════════════════════════
// WAVEFORM VISUALIZATION
// ══════════════════════════════════════════════
function startWaveform() {
  stopWaveform();

  const wrap = document.getElementById('waveformWrap');
  wrap.innerHTML = '';

  // Build 48 bars, each with randomised max-height, duration, and delay
  // assigned as CSS custom properties so the keyframe animation varies per bar.
  for (let i = 0; i < WAVE_BARS; i++) {
    const b = document.createElement('div');
    b.className = 'waveform-bar';
    // --wh  : peak height  6 – 48 px  (centre bars taller for a natural arch)
    const centre  = (WAVE_BARS - 1) / 2;
    const dist    = Math.abs(i - centre) / centre;          // 0 at centre, 1 at edges
    const maxH    = Math.round(48 - dist * 28 + Math.random() * 10);  // 20–48 px
    // --wd  : animation duration  0.45 – 1.1 s
    const dur     = (0.45 + Math.random() * 0.65).toFixed(2);
    // --wdl : negative delay staggers bars so they don't all peak at once
    const delay   = (-Math.random()).toFixed(2);
    b.style.setProperty('--wh',  `${maxH}px`);
    b.style.setProperty('--wd',  `${dur}s`);
    b.style.setProperty('--wdl', `${delay}s`);
    wrap.appendChild(b);
  }

  wrap.classList.add('on');
}

function stopWaveform() {
  if (waveAnimFrame) { cancelAnimationFrame(waveAnimFrame); waveAnimFrame = null; }
  if (waveAnalyser)  { try { waveAnalyser.disconnect(); } catch {} waveAnalyser = null; }
  if (waveAudioCtx)  { try { waveAudioCtx.close(); }     catch {} waveAudioCtx = null; }
  const wrap = document.getElementById('waveformWrap');
  if (wrap) wrap.classList.remove('on');
}

// ══════════════════════════════════════════════
// PHONEME BREAKDOWN
// ══════════════════════════════════════════════
// Spanish mini-dictionary — key is lowercase normalised English word
const ES_DICT = {
  // Articles / determiners
  a:'un', an:'un', the:'el',
  // Pronouns
  i:'yo', you:'tú', he:'él', she:'ella', we:'nosotros', they:'ellos', it:'eso',
  me:'mí', him:'él', her:'ella', us:'nos', them:'ellos',
  my:'mi', your:'tu', his:'su', our:'nuestro', their:'su',
  // To be
  is:'es', are:'son', was:'era', be:'ser', been:'sido',
  im:'soy',  // "I'm" normalised
  // Common verbs
  have:'tener', has:'tiene', had:'había',
  do:'hacer', does:'hace', did:'hizo', done:'hecho',
  will:'voy', would:'sería', can:'puedo', could:'podría', shall:'debo',
  get:'conseguir', got:'conseguí', go:'ir', going:'ir',
  know:'saber', knew:'sabía',
  see:'ver', saw:'vi', seen:'visto',
  find:'encontrar', found:'encontré',
  kill:'matar', killed:'maté',
  stop:'parar', talk:'hablar', talking:'hablando',
  fly:'volar', flying:'volando',
  need:'necesitar', needs:'necesita',
  smash:'aplastar',
  back:'volver',
  come:'venir',
  take:'tomar',
  give:'dar',
  want:'querer',
  think:'pensar',
  look:'mirar',
  tell:'decir',
  say:'decir',
  make:'hacer',
  // Nouns
  box:'caja', road:'camino', roads:'caminos',
  people:'gente', person:'persona',
  duvet:'edredón',
  scene:'escena', movie:'película', time:'tiempo',
  man:'hombre', woman:'mujer', world:'mundo',
  life:'vida', day:'día', night:'noche',
  // Adjectives & adverbs
  dead:'muerto', okay:'bien', ok:'bien',
  never:'nunca', always:'siempre', now:'ahora',
  here:'aquí', there:'allí', where:'dónde',
  not:'no', no:'no', yes:'sí',
  // Scene-specific words
  amateur:'aficionada', kung:'kung', fu:'fu',
  hulk:'hulk', jack:'jack', slick:'listo',
  // Contractions (normalised — apostrophes stripped)
  dont:"no", doesnt:"no", wont:"no", cant:"no puedo",
  were:'íbamos', youre:'eres', ill:'voy a',
  whats:'qué es', gonna:'va a',
  // Conjunctions / prepositions
  and:'y', in:'en', on:'en', at:'en', of:'de',
  for:'para', to:'a', with:'con', from:'de', about:'sobre',
  but:'pero', or:'o', that:'eso', this:'esto', what:'qué',
};

function esTranslate(word) {
  // Strip punctuation, lowercase
  const key = word.toLowerCase().replace(/[^a-z']/g, '').replace(/'/g, '');
  return ES_DICT[key] || 'traducir…';
}

function renderPhonemeBreakdown(expected, transcribed) {
  const section = document.getElementById('phonSection');
  const wordsEl = document.getElementById('phonWords');

  const tokens = wordBreakdown(expected, transcribed);
  if (!tokens.length) { section.style.display = 'none'; return; }

  wordsEl.innerHTML = tokens.map(({ word, status }) =>
    `<span class="phon-word ${status}">
       <span class="phon-inner">
         <span class="phon-face phon-front">${word}</span>
         <span class="phon-face phon-back">&#127466;&#127480; ${esTranslate(word)}</span>
       </span>
     </span>`
  ).join('');
  section.style.display = '';
}

// Returns [{word, status:'good'|'close'|'miss'}, …] for each word in expected
function wordBreakdown(expected, transcribed) {
  // Strip only punctuation that's not apostrophes, split into display tokens
  const expTokens = expected.split(/\s+/).filter(Boolean);
  const trnWords  = normalizeText(transcribed).split(/\s+/).filter(Boolean);

  const used = new Array(trnWords.length).fill(false);

  return expTokens.map(token => {
    const norm = normalizeText(token);
    if (!norm) return { word: token, status: 'good' };

    let bestSim = 0, bestIdx = -1;
    trnWords.forEach((tw, i) => {
      if (used[i]) return;
      const sim = charSeqRatio(norm, tw);
      if (sim > bestSim) { bestSim = sim; bestIdx = i; }
    });

    let status;
    if (bestIdx >= 0 && bestSim >= 0.9) {
      used[bestIdx] = true;
      status = 'good';
    } else if (bestIdx >= 0 && bestSim >= 0.55) {
      used[bestIdx] = true;
      status = 'close';
    } else {
      status = 'miss';
    }
    return { word: token, status };
  });
}

// Normalise: lowercase, strip non-word chars except apostrophes
function normalizeText(s) {
  return s.toLowerCase().replace(/[^\w'\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Character-level sequence similarity ratio (mirrors Python's SequenceMatcher)
function charSeqRatio(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const m = lcsLength(a, b);
  return (2 * m) / (a.length + b.length);
}

function lcsLength(a, b) {
  // Standard DP — fine for short words (≤30 chars each)
  const prev = new Uint16Array(b.length + 1);
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    const curr = new Uint16Array(b.length + 1);
    for (let j = 0; j < b.length; j++) {
      curr[j + 1] = a[i] === b[j] ? prev[j] + 1 : Math.max(curr[j], prev[j + 1]);
      if (curr[j + 1] > result) result = curr[j + 1];
    }
    prev.set(curr);
  }
  return result;
}

// ══════════════════════════════════════════════
// PROGRESS DASHBOARD
// ══════════════════════════════════════════════
document.getElementById('btnMyProgress').addEventListener('click', openProgressDashboard);
document.getElementById('btnProgressClose').addEventListener('click', closeProgressDashboard);
document.getElementById('progressOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('progressOverlay')) closeProgressDashboard();
});

function openProgressDashboard() {
  document.getElementById('progressOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  loadHistory();
}

function closeProgressDashboard() {
  document.getElementById('progressOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

async function loadHistory() {
  document.getElementById('historyList').innerHTML = `<div class="history-empty">Loading\u2026</div>`;
  const headers = { Authorization: `Bearer ${authToken}` };
  try {
    const [histRes, profRes] = await Promise.all([
      fetch(`${API}/api/history`, { headers }),
      fetch(`${API}/api/profile`, { headers }),
    ]);
    if (!histRes.ok) throw new Error();
    const data = await histRes.json();
    renderProgressDashboard(data);
    renderPersonalBests(data.history);
    if (profRes.ok) {
      const prof = await profRes.json();
      renderDivCard(prof);
      updateDivDot(prof.total_points || 0);
    }
  } catch {
    document.getElementById('historyList').innerHTML = `<div class="history-empty">Could not load history</div>`;
  }
}

function renderDivCard(prof) {
  const card = document.getElementById('divCard');
  if (!prof || !prof.division) { card.classList.remove('on'); return; }
  card.classList.add('on');
  const d     = prof.division;
  const badge = document.getElementById('divCardBadge');
  badge.textContent       = d.name.slice(0, 3).toUpperCase();
  badge.style.color       = d.color;
  badge.style.borderColor = d.color;
  badge.style.background  = d.color + '18';
  const nameEl = document.getElementById('divCardName');
  nameEl.textContent  = d.name;
  nameEl.style.color  = d.color;
  const streakTxt = prof.streak > 0
    ? ` &nbsp;&#128293; ${prof.streak}-day streak`
    : '';
  document.getElementById('divCardPts').innerHTML = `${prof.total_points} total points${streakTxt}`;
  const nextEl = document.getElementById('divCardNext');
  if (prof.next_division) {
    nextEl.innerHTML = `<strong>${prof.points_to_next}</strong>pts to ${prof.next_division.name}`;
  } else {
    nextEl.innerHTML = `<strong>MAX</strong>rank achieved`;
  }
}

function renderProgressDashboard({ history, stats }) {
  // Circular avg score
  const avg = stats.avg_score || 0;
  const circleColor = avg >= 70 ? 'var(--green)' : avg >= 40 ? 'var(--gold)' : 'var(--red)';
  document.getElementById('progCircle').innerHTML = buildCircleSVG(avg, circleColor);

  // Stat cards
  document.getElementById('progBest').innerHTML =
    stats.best_score > 0 ? `${stats.best_score}<sup style="font-size:16px;opacity:.6">%</sup>` : '—';
  document.getElementById('progScenes').textContent = stats.unique_scenes || 0;

  const impEl   = document.getElementById('progImprovement');
  const impSign = stats.improvement > 0 ? '+' : '';
  impEl.innerHTML = `${impSign}${stats.improvement}<sup style="font-size:16px;opacity:.6">%</sup>`;
  impEl.className = `prog-stat-val${stats.improvement > 0 ? ' green' : stats.improvement < 0 ? ' red' : ''}`;

  // History label with count
  document.getElementById('historyLabel').textContent =
    `Score History  —  ${stats.total_attempts} recording${stats.total_attempts !== 1 ? 's' : ''}`;

  // History list
  const listEl = document.getElementById('historyList');
  if (!history.length) {
    listEl.innerHTML = `<div class="history-empty">No recordings yet — start acting!</div>`;
    return;
  }

  const improved = computeImprovedIds(history);
  listEl.innerHTML = history.map(h => {
    const c    = h.sync_score >= 85 ? '#06d6a0' : h.sync_score >= 65 ? '#ffd166' : h.sync_score >= 40 ? '#f4a261' : '#e63946';
    const date = h.created_at ? new Date(h.created_at).toLocaleDateString() : '—';
    const isUp = improved.has(h.id);
    return `<div class="history-item${isUp ? ' improved' : ''}">
      <span class="history-movie">${h.movie}</span>
      <span class="history-date">${date}</span>
      <span class="history-score" style="color:${c}">${h.sync_score}<sup style="font-size:11px;opacity:.7">%</sup></span>
      ${isUp ? '<span class="history-improved-badge">\u2191 Improved</span>' : ''}
    </div>`;
  }).join('');
}

function renderPersonalBests(history) {
  const pbEl = document.getElementById('pbList');
  const best = userProgress.best_scores;
  if (!best || !Object.keys(best).length) {
    pbEl.innerHTML = '<div class="pb-empty">No scores yet \u2014 start recording!</div>';
    return;
  }

  // Build latest and second-latest score per scene from history (newest-first order)
  const latestByScene = {}, prevByScene = {};
  for (const h of history) {
    if (!(h.scene_id in latestByScene)) latestByScene[h.scene_id] = h.sync_score;
    else if (!(h.scene_id in prevByScene)) prevByScene[h.scene_id] = h.sync_score;
  }

  const sorted = Object.entries(best).sort(([, a], [, b]) => b - a);
  pbEl.innerHTML = sorted.map(([sid, score], idx) => {
    const movie    = scenes[sid]?.movie || sid;
    const color    = getSceneColor(sid, 'var(--gold)');
    const latest   = latestByScene[sid];
    const prev     = prevByScene[sid];
    // Show ↑ if the most recent attempt is better than the one before it
    const improved = latest !== undefined && prev !== undefined && latest > prev;
    return `<div class="pb-item">
      <div class="pb-rank">#${idx + 1}</div>
      <div class="pb-movie">${movie}</div>
      ${improved ? '<div class="pb-arrow">&#8593;</div>' : ''}
      <div class="pb-score" style="color:${color}">${Math.round(score)}<sup>%</sup></div>
    </div>`;
  }).join('');
}

function buildCircleSVG(pct, color) {
  const r = 48, cx = 60;
  const circ   = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(pct, 100) / 100);
  return `<svg width="140" height="140" viewBox="0 0 120 120">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="10"/>
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${color}" stroke-width="10"
      stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
      stroke-linecap="round" transform="rotate(-90 ${cx} ${cx})"/>
    <text x="${cx}" y="${cx + 10}" text-anchor="middle" fill="${color}"
      font-family="'Bebas Neue',cursive" font-size="30" dominant-baseline="middle">${Math.round(pct)}</text>
  </svg>`;
}

function computeImprovedIds(history) {
  // history is newest-first; mark an entry if its score beats the previous attempt on the same scene
  const improved = new Set();
  for (let i = 0; i < history.length; i++) {
    for (let j = i + 1; j < history.length; j++) {
      if (history[j].scene_id === history[i].scene_id) {
        if (history[i].sync_score > history[j].sync_score) improved.add(history[i].id);
        break;
      }
    }
  }
  return improved;
}

// ══════════════════════════════════════════════
// PLAYBACK COMPARE — Hear the Actor / Hear Yourself
// ══════════════════════════════════════════════
document.getElementById('dcOpenBtn').addEventListener('click', () => {
  if (!dailyChallenge) return;
  const s = dailyChallenge.scene || scenes[dailyChallenge.scene_id];
  if (s) openModal(dailyChallenge.scene_id, s);
});

document.getElementById('btnHearActor').addEventListener('click', hearActor);
document.getElementById('btnHearSelf').addEventListener('click',  hearSelf);

// Flip word cards on tap/click
document.getElementById('phonWords').addEventListener('click', e => {
  const card = e.target.closest('.phon-word');
  if (card) card.classList.toggle('flipped');
});
document.getElementById('btnTryAgain').addEventListener('click', () => {
  resetRec();
  document.getElementById('modal').scrollTo({ top: 0, behavior: 'smooth' });
});

function hearActor() {
  const ytRaw = getSceneYouTubeId(activeScene);
  if (!ytRaw) return;
  const videoId  = ytRaw.split('?')[0];
  const times    = getSceneTimes(activeScene);
  const startSec = times ? times.start : 0;
  hideReplayLine();
  if (ytPlayer) {
    ytPlayer.seekTo(startSec, true);
    ytPlayer.playVideo();
  } else {
    document.getElementById('videoFrame').style.display = '';
    document.getElementById('videoPlaceholder').style.display = 'none';
    initYTPlayer(videoId, startSec);
  }
  document.getElementById('modal').scrollTo({ top: 0, behavior: 'smooth' });
}

function hearSelf() {
  if (!audioBlob) return;
  const audio = new Audio(URL.createObjectURL(audioBlob));
  audio.play();
}

// ══════════════════════════════════════════════
// YOUTUBE PLAYER
// ══════════════════════════════════════════════
function initYTPlayer(videoId, startSec) {
  if (ytPlayer) {
    ytPlayer.loadVideoById({ videoId, startSeconds: startSec });
    return;
  }
  ytPlayer = new YT.Player('videoFrame', {
    videoId,
    playerVars: { autoplay: 1, start: startSec, rel: 0, modestbranding: 1 },
    events: { onStateChange: onYTStateChange },
  });
}

function onYTStateChange(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    startEndCheck();
  } else {
    stopEndCheck();
  }
}

function startEndCheck() {
  stopEndCheck();
  const times = getSceneTimes(activeScene);
  if (!times || !ytPlayer) return;
  ytEndInterval = setInterval(() => {
    if (!ytPlayer) return stopEndCheck();
    if (ytPlayer.getCurrentTime() >= times.end - 1) {
      ytPlayer.pauseVideo();
      stopEndCheck();
      showReplayLine();
    }
  }, 250);
}

function stopEndCheck() {
  if (ytEndInterval) { clearInterval(ytEndInterval); ytEndInterval = null; }
}

function showReplayLine() {
  document.getElementById('replayLineWrap').style.display = 'flex';
}

function hideReplayLine() {
  document.getElementById('replayLineWrap').style.display = 'none';
}

document.getElementById('btnReplayLine').addEventListener('click', () => {
  const times = getSceneTimes(activeScene);
  const startSec = times ? times.start : 0;
  hideReplayLine();
  if (ytPlayer) { ytPlayer.seekTo(startSec, true); ytPlayer.playVideo(); }
});

// ══════════════════════════════════════════════
// FRIEND CHALLENGE
// ══════════════════════════════════════════════
async function loadChallengePage(cid) {
  try {
    const r = await fetch(`${API}/api/challenge/${cid}`);
    if (!r.ok) { showAuthScreen(); return; }
    activeChallenge = await r.json();
    document.getElementById('chlgChallenger').textContent = activeChallenge.challenger_username;
    document.getElementById('chlgScoreVal').textContent   = Math.round(activeChallenge.score_to_beat);
    document.getElementById('chlgMovie').textContent      = activeChallenge.scene.movie || '';
    const noteEl = document.getElementById('chlgAuthNote');
    if (authToken) {
      const ok = await verifyToken();
      if (ok) {
        noteEl.textContent = `Playing as ${authUser.username}`;
      } else {
        noteEl.innerHTML = `<a id="chlgLoginLink">Log in</a> to record your score`;
        document.getElementById('chlgLoginLink').addEventListener('click', showAuthFromChallenge);
      }
    } else {
      noteEl.innerHTML = `<a id="chlgLoginLink">Log in or register</a> to record your score`;
      document.getElementById('chlgLoginLink').addEventListener('click', showAuthFromChallenge);
    }
    document.getElementById('challengeScreen').classList.add('on');
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appScreen').style.display  = 'none';
  } catch {
    showAuthScreen();
  }
}

function showAuthFromChallenge() {
  document.getElementById('challengeScreen').classList.remove('on');
  showAuthScreen();
  openAuthModal('login');
}

function enterChallengeFromAuth() {
  if (!activeChallenge) return;
  challengeCtx = { score_to_beat: activeChallenge.score_to_beat };
  closeAuthModal();
  const sid = activeChallenge.scene_id;
  const s   = scenes[sid] || activeChallenge.scene;
  if (s) openModal(sid, s);
}

document.getElementById('btnAcceptChallenge').addEventListener('click', () => {
  if (!activeChallenge) return;
  if (authToken && authUser) {
    enterChallengeFromAuth();
  } else {
    showAuthFromChallenge();
  }
});

document.getElementById('btnChallenge').addEventListener('click', createChallenge);

async function createChallenge() {
  if (!authToken || !activeScene) return;
  const score = parseFloat(document.getElementById('scoreVal').textContent) || 0;
  setBtn('btnChallenge', true, '&#9876; Generating\u2026');
  try {
    const r = await fetch(`${API}/api/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ scene_id: activeScene, score }),
    });
    if (!r.ok) throw new Error('Failed');
    const data = await r.json();
    const challengeUrl = resolveAppUrl(data.url);
    const movie = scenes[activeScene]?.movie || 'MIRROR';
    const msg   = `I scored ${score}% on ${movie} in MIRROR! Can you beat it? ${challengeUrl}`;
    document.getElementById('chlgLinkInput').textContent = challengeUrl;
    document.getElementById('btnCopyLink').onclick = () => {
      navigator.clipboard.writeText(challengeUrl).then(() => {
        document.getElementById('btnCopyLink').textContent = '\u2713 Copied!';
        setTimeout(() => { document.getElementById('btnCopyLink').textContent = 'Copy'; }, 2000);
      });
    };
    document.getElementById('btnWhatsapp').onclick = () => {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
    };
    document.getElementById('challengeShare').classList.add('on');
  } catch {
    alert('Could not create challenge link. Please try again.');
  } finally {
    setBtn('btnChallenge', false, '&#9876; Challenge a Friend');
  }
}

function showChallengeResult(score, scoreToBeat) {
  const el  = document.getElementById('challengeResult');
  const won = score > scoreToBeat;
  el.className = 'challenge-result ' + (won ? 'won' : 'lost');
  if (won) {
    el.innerHTML = `<div class="chlg-result-icon">\uD83C\uDFC6</div>
      <div class="chlg-result-title">YOU WON!</div>
      <div class="chlg-result-sub">You scored ${score}% vs ${scoreToBeat}% \u2014 challenge beaten!</div>`;
  } else {
    el.innerHTML = `<div class="chlg-result-icon">\uD83D\uDE24</div>
      <div class="chlg-result-title">So Close!</div>
      <div class="chlg-result-sub">You scored ${score}% — need ${scoreToBeat}% to win. Try again!</div>`;
  }
}

// ══════════════════════════════════════════════
// CINEMATIC LEVEL CARDS
// ══════════════════════════════════════════════
function updateLevelCardStats() {
  const best     = (userProgress && userProgress.best_scores) ? userProgress.best_scores : {};
  const unlocked = (userProgress && userProgress.unlocked_scenes && userProgress.unlocked_scenes.length) ? userProgress.unlocked_scenes : getDefaultUnlockedScenes();
  CLV_LEVELS.forEach(lv => {
    const scores = lv.scenes.map(sid => best[sid]).filter(v => v > 0);
    const avg    = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const avgEl  = document.getElementById(`clvPbAvg${lv.level}`);
    if (avgEl) avgEl.textContent = scores.length ? `Avg PB: ${avg}%` : '';
    if (lv.level === 1) return; // Level 1 always unlocked
    const isUnlocked = lv.scenes.some(sid => unlocked.includes(sid));
    const lockEl = document.getElementById(`clvLock${lv.level}`);
    const ctaEl  = document.getElementById(`clvCta${lv.level}`);
    if (lockEl) lockEl.style.display = isUnlocked ? 'none' : '';
    if (ctaEl)  ctaEl.style.display  = isUnlocked ? ''     : 'none';
  });
}

async function openLevelPanel(level) {
  try {
    await ensureSceneConfig();
  } catch {
    return;
  }
  const lv = CLV_LEVELS.find(l => l.level === level);
  if (!lv) return;
  const badgeEl = document.getElementById('clvPanelBadge');
  badgeEl.textContent = lv.label;
  badgeEl.className   = 'clv-panel-badge ' + lv.cls;
  document.getElementById('clvPanelTitle').textContent = 'Level ' + lv.level;
  document.getElementById('clvPanelSub').textContent   = lv.desc;

  // Set the level number
  const numEl = document.getElementById('clvPanelNum');
  if (numEl) numEl.textContent = String(lv.level).padStart(2, '0');

  const best     = (userProgress && userProgress.best_scores)      ? userProgress.best_scores      : {};
  const unlocked = (userProgress && userProgress.unlocked_scenes && userProgress.unlocked_scenes.length) ? userProgress.unlocked_scenes : getDefaultUnlockedScenes();

  // Scene count
  const countEl = document.getElementById('clvPanelCount');
  if (countEl) countEl.innerHTML = '<strong>' + lv.scenes.length + '</strong> scenes';

  // Avg PB
  const scores = lv.scenes.map(function(sid) { return best[sid]; }).filter(function(v) { return v > 0; });
  const avg = scores.length ? Math.round(scores.reduce(function(a, b) { return a + b; }, 0) / scores.length) : 0;
  const avgEl = document.getElementById('clvPanelAvg');
  if (avgEl) avgEl.textContent = scores.length ? 'Avg PB: ' + avg + '%' : '';

  const list = document.getElementById('clvClipList');
  list.innerHTML = lv.scenes.map(function(sid) {
    var s      = (scenes && scenes[sid]) ? scenes[sid] : {};
    var pb     = best[sid] ? Math.round(best[sid]) : null;
    var locked = !unlocked.includes(sid);
    var quote  = s.quote ? s.quote.slice(0, 55) + (s.quote.length > 55 ? '\u2026' : '') : '';
    var color  = getSceneColor(sid);
    var poster = getScenePoster(sid);
    var posterHTML = poster
      ? '<img src="' + poster + '" alt="' + (s.movie || sid) + '" loading="lazy">'
      : '<div class="sc-poster-ph" style="background:linear-gradient(150deg,' + color + ',#111)"></div>';
    var scoreHTML = '';
    if (locked) {
      scoreHTML = '<span class="sc-lock-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>';
    } else if (pb) {
      var scoreColor = pb >= 85 ? '#06d6a0' : pb >= 65 ? '#ffd166' : '#C9A84C';
      scoreHTML = '<span class="sc-score" style="color:' + scoreColor + ';background:' + scoreColor + '18;border-color:' + scoreColor + '44">' + pb + '%</span>';
    }
    return '<div class="sc-card' + (locked ? ' locked' : '') + '"' + (locked ? '' : ' onclick="selectScene(\'' + sid + '\')"') + '>'
      + '<div class="sc-poster">'
      + posterHTML
      + '<div class="sc-poster-overlay"></div>'
      + (s.year ? '<span class="sc-year">' + s.year + '</span>' : '')
      + scoreHTML
      + (locked ? '' : '<div class="sc-play"><svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg></div>')
      + '</div>'
      + '<div class="sc-info">'
      + '<div class="sc-accent" style="background:' + color + '"></div>'
      + '<div class="sc-movie">' + (s.movie || sid) + '</div>'
      + '<div class="sc-quote">&ldquo;' + quote + '&rdquo;</div>'
      + '</div>'
      + '</div>';
  }).join('');

  var firstScene = lv.scenes.find(function(sid) { return unlocked.includes(sid); });
  var playBtn    = document.getElementById('clvPanelPlayBtn');
  if (firstScene) {
    playBtn.style.display = '';
    playBtn.onclick = function() { closeLevelPanel(); selectScene(firstScene); };
  } else {
    playBtn.style.display = 'none';
  }

  document.getElementById('clvPanel').classList.add('open');
  document.getElementById('clvPanelBackdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLevelPanel() {
  document.getElementById('clvPanel').classList.remove('open');
  document.getElementById('clvPanelBackdrop').classList.remove('open');
  document.body.style.overflow = '';
}

function selectScene(sid) {
  closeLevelPanel();
  const appScreen = document.getElementById('appScreen');
  if (appScreen && appScreen.style.display !== 'none') {
    const s = scenes && scenes[sid];
    if (s) openModal(sid, s);
  } else {
    openAuthModal('register');
  }
}

// Hook renderLevelBar to also refresh level card stats after progress loads
const _clvOrigRLB = renderLevelBar;
renderLevelBar = function () { _clvOrigRLB(); updateLevelCardStats(); };