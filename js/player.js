import { $, $$, esc, fmtTime, fmtSpoken, clamp, throttle, icon, num3, absUrl } from './util.js';
import { catalog, sources } from './data.js';
import { store } from './store.js';
import { toast, announce, openMenu, closeMenu, isMenuOpen } from './ui.js';
import { createSeekbar } from './seekbar.js';
import { createControls } from './controls.js';
import { createPlayerMotion } from './motion.js';

const player = $('#player');
const videoEl = $('#media');
const audioEl = $('#audio');
let media = videoEl;
const embed = $('#embed');
const app = $('#app');
const stage = $('#stage');
const seekEl = $('#seek');
const spinner = $('#spinner');
const msg = $('#msg');
const msgText = $('#msgText');
const msgActions = $('#msgActions');
const auImg = $('#auImg');
const BASE_TITLE = document.title;

auImg.addEventListener('error', () => {
  if (auImg.dataset.fallback) return;
  auImg.dataset.fallback = '1';
  auImg.src = 'assets/satania-logo.webp';
});

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SLEEP = [
  { label: 'Off', min: 0 },
  { label: '15 minutes', min: 15 },
  { label: '30 minutes', min: 30 },
  { label: '45 minutes', min: 45 },
  { label: '1 hour', min: 60 },
  { label: '90 minutes', min: 90 },
  { label: 'End of this meditation', end: true }
];
const AFTER = [
  { label: 'Play next', value: 'next', icon: 'autonext', short: 'Autoplay' },
  { label: 'Repeat this one', value: 'repeat', icon: 'repeat', short: 'Repeat' },
  { label: 'Stop after this', value: 'stop', icon: 'stop', short: 'Once' }
];
const SKIP = 10;
const FADE_MS = 8000;

const state = {
  mode: 'closed',
  kind: 'media',
  src: null,
  queue: [],
  index: -1,
  ctx: 'Archive',
  current: null,
  ready: false,
  seeking: false,
  pendingSeek: 0,
  quietResume: false,
  counted: false,
  sleep: null,
  fadeBase: null,
  failed: false,
  opener: null
};

let hooks = { open: () => {}, close: () => {} };
const changeListeners = new Set();
const notify = () => changeListeners.forEach((fn) => fn());

const isLocal = () => state.kind !== 'embed';

function onMedia(type, fn) {
  for (const el of [videoEl, audioEl]) {
    el.addEventListener(type, (e) => {
      if (el === media) fn(e);
    });
  }
}

const controls = createControls({
  stage,
  media: videoEl,
  actions: {
    skipBy: SKIP,
    isPlaying: () => state.kind === 'media' && !media.paused && !media.ended,
    menuOpen: () => isMenuOpen(),
    toggle: () => toggle(),
    skip: (d) => skip(d)
  }
});

const motion = createPlayerMotion({ player, stage, blocked: () => controls.isFullscreen() });

const seekbar = createSeekbar(seekEl, {
  onStart: () => {
    state.seeking = true;
    controls.hold(true);
  },
  onScrub: (t) => {
    $('#tCur').textContent = fmtTime(t);
    seekbar.text(`${fmtSpoken(t)} of ${fmtSpoken(seekMax)}`);
  },
  onCommit: (t) => {
    state.seeking = false;
    controls.hold(false);
    if (t !== null && isLocal()) media.currentTime = clamp(t, 0, Number.isFinite(media.duration) ? media.duration : t);
    updateTime();
  }
});
let seekMax = 0;

export const playerApi = {
  onChange(fn) {
    changeListeners.add(fn);
  },
  get current() {
    return state.current;
  },
  get playing() {
    return !!state.current && (state.kind === 'embed' ? state.mode !== 'closed' : !media.paused && !media.ended);
  },
  get mode() {
    return state.mode;
  }
};

const QUEUE_FIRST = 36;
let queueRestTimer = 0;

function queueItemHTML(id) {
  const m = catalog.byId.get(id);
  if (!m) return '';
  return `<li><button type="button" class="q-item" data-id="${esc(id)}"><span class="q-item__num">${num3(m.num)}</span><span class="q-item__title">${esc(m.title)}</span><span class="q-item__eq" aria-hidden="true"><i></i><i></i><i></i></span></button></li>`;
}

function renderQueue(focusId) {
  clearTimeout(queueRestTimer);
  $('#queueCount').textContent = state.queue.length ? `${state.queue.length} total` : '';
  const list = $('#queueList');
  const queue = state.queue;
  const at = focusId ? queue.indexOf(focusId) : -1;
  const head = Math.min(queue.length, Math.max(QUEUE_FIRST, at + 12));
  list.innerHTML = queue.slice(0, head).map(queueItemHTML).join('');
  markQueue();
  if (head < queue.length) {
    queueRestTimer = setTimeout(() => {
      if (state.queue !== queue) return;
      list.insertAdjacentHTML('beforeend', queue.slice(head).map(queueItemHTML).join(''));
      markQueue(false);
    }, 700);
  }
}

function markQueue(scroll = true) {
  const id = state.current && state.current.id;
  let cur = null;
  $$('#queueList .q-item').forEach((b) => {
    const on = b.dataset.id === id;
    if (on) {
      b.setAttribute('aria-current', 'true');
      cur = b;
    } else b.removeAttribute('aria-current');
  });
  if (scroll && cur && state.mode === 'full' && window.matchMedia('(min-width:900px) and (min-height:561px)').matches) {
    cur.scrollIntoView({ block: 'nearest' });
  }
}

$('#queueList').addEventListener('click', (e) => {
  const b = e.target.closest('.q-item');
  if (!b) return;
  const idx = state.queue.indexOf(b.dataset.id);
  if (idx !== -1) goTo(idx, true);
});

function resolveSource(m) {
  const wantAudio = store.pref('mode') === 'audio';
  const wantArchive = store.pref('source') === 'archive';
  if (wantAudio) {
    const audio = sources.audio(m);
    if (audio) return { kind: 'audio', url: audio, fallback: null };
    const video = sources.archive(m);
    if (video) return { kind: 'media', url: video, fallback: 'audio' };
    return { kind: 'embed', url: sources.drive(m), fallback: 'audio' };
  }
  const url = sources.archive(m);
  if (wantArchive && url) return { kind: 'media', url, fallback: null };
  return { kind: 'embed', url: sources.drive(m), fallback: wantArchive ? 'archive' : null };
}

function setKind(kind) {
  state.kind = kind;
  player.classList.toggle('is-embed', kind === 'embed');
  player.classList.toggle('is-audio', kind === 'audio');
  stage.classList.toggle('is-audio', kind === 'audio');
  videoEl.hidden = kind !== 'media';
  audioEl.hidden = true;
  if (kind === 'audio') controls.exitFullscreen();
  embed.hidden = kind !== 'embed';
  $('#embedNote').hidden = kind !== 'embed' || state.mode !== 'full';
  $('#embedNav').hidden = kind !== 'embed';
  syncPipHint();
}

function activate(el) {
  if (media === el) return;
  const old = media;
  restoreVolume();
  media = el;
  applyPlaybackPrefs(el);
  old.pause();
  old.removeAttribute('src');
  old.load();
}

function stopMedia() {
  for (const el of [videoEl, audioEl]) {
    el.pause();
    el.removeAttribute('src');
    el.load();
  }
}

function applyPlaybackPrefs(el) {
  el.volume = clamp(Number(store.pref('volume')), 0, 1);
  el.muted = !!store.pref('muted');
  el.defaultPlaybackRate = store.pref('speed');
  el.playbackRate = store.pref('speed');
}

const DEFAULT_PIP_HINT = $('#pipHintText').textContent;
const ANDROID_PIP_HINT =
  'No pop-out button here. If your device supports it, switch to full screen and press the Home button to open the pop-out window. If nothing happens, check Settings → Apps → Special access → Picture-in-picture';
const isAndroidChrome = /Android/i.test(navigator.userAgent) && /Chrome\//.test(navigator.userAgent) && !/Firefox/i.test(navigator.userAgent);

function syncPipHint() {
  $('#pipHintText').textContent = isAndroidChrome ? ANDROID_PIP_HINT : DEFAULT_PIP_HINT;
  $('#pipHint').hidden = state.kind !== 'media' || controls.pipSupported();
}

function loadTrack(id, { autoplay = false, resumeAt = null } = {}) {
  const m = catalog.byId.get(id);
  if (!m) return false;

  persistPosition();
  state.current = m;
  state.index = state.queue.indexOf(id);
  state.ready = false;
  state.counted = false;
  state.failed = false;
  state.pendingSeek = 0;
  state.quietResume = resumeAt !== null;
  hideMessage();
  endOfTrackReset();
  controls.show();

  const src = resolveSource(m);
  state.src = src;
  setKind(src.kind);

  if (src.kind === 'media' || src.kind === 'audio') {
    activate(src.kind === 'audio' ? audioEl : videoEl);
    embed.removeAttribute('src');
    const saved = store.position(id);
    if (resumeAt !== null) state.pendingSeek = resumeAt;
    else if (saved && saved.t > 5 && (!saved.d || saved.t < saved.d - 20)) state.pendingSeek = saved.t;
    if (src.kind === 'media') media.poster = m.thumb;
    media.defaultPlaybackRate = store.pref('speed');
    media.src = src.url;
    media.playbackRate = store.pref('speed');
    setSeekMax(store.duration(id));
    if (autoplay) startPlayback();
  } else {
    stopMedia();
    embed.src = src.url;
    setSeekMax(0);
    store.pushHistory(id);
    state.counted = true;
  }

  if (src.fallback === 'archive') toast('Not on the Internet Archive yet. Playing through Google Drive.');
  else if (src.fallback === 'audio') toast('No audio version yet. Playing the video.');

  fillMeta(m);
  renderTools();
  markQueue();
  syncMediaSession();
  syncTransportState();
  document.title = `${m.main} — Satania Archive`;
  announce(`${m.main}`);
  notify();
  return true;
}

function startPlayback() {
  const p = media.play();
  if (p && p.catch) {
    p.catch((err) => {
      if (err && err.name === 'NotAllowedError') syncTransportState();
    });
  }
}

function fillMeta(m) {
  $('#pNum').textContent = `No. ${num3(m.num)}`;
  $('#pTitle').textContent = m.main;
  $('#pSub').textContent = m.sub;
  $('#pTags').textContent = m.playlists.join(' · ');
  if (state.kind === 'audio') auImg.src = m.thumb;
  $('#vNum').textContent = `No. ${num3(m.num)}`;
  $('#vTitle').textContent = m.main;
  $('#ctxLabel').innerHTML = `Playing from <b>${esc(state.ctx)}</b>`;
  const fav = $('#toolFav');
  fav.setAttribute('aria-pressed', store.isFav(m.id) ? 'true' : 'false');
}

function setMode(next) {
  const prev = state.mode;
  if (prev === next) return;
  if (prev === 'full') closeMenu(false);
  state.mode = next;
  motion.run(prev, next, () => applyMode(prev, next));
  if (next === 'closed') document.title = BASE_TITLE;
  notify();
}

function lockScroll(on) {
  const root = document.documentElement;
  if (on && !document.body.classList.contains('has-full')) {
    root.style.setProperty('--sbw', Math.max(0, window.innerWidth - root.clientWidth) + 'px');
  }
  document.body.classList.toggle('has-full', on);
}

function applyMode(prev, next) {
  player.dataset.state = next;
  player.hidden = next === 'closed';
  document.body.classList.toggle('has-mini', next === 'mini');
  lockScroll(next === 'full');
  app.inert = next === 'full';
  $('#embedNote').hidden = state.kind !== 'embed' || next !== 'full';
  controls.setActive(next === 'full');

  if (next === 'full') {
    state.opener = document.activeElement;
    requestAnimationFrame(() => $('#btnMinimize').focus({ preventScroll: true }));
    markQueue();
    syncTransportState();
  } else if (prev === 'full') {
    const o = state.opener;
    state.opener = null;
    closeMenu(false);
    controls.exitFullscreen();
    if (o && o.isConnected && o !== document.body) requestAnimationFrame(() => o.focus({ preventScroll: true }));
  }
}

export function present(id) {
  if (!state.current || state.current.id !== id) {
    if (!catalog.byId.has(id)) return false;
    if (!state.queue.includes(id)) {
      state.queue = catalog.items.map((m) => m.id);
      state.ctx = 'Archive';
      renderQueue(id);
    }
    loadTrack(id, { autoplay: false });
  }
  setMode('full');
  return true;
}

export function dock() {
  if (state.mode === 'full') setMode(state.current ? 'mini' : 'closed');
}

export function start(id, queueIds, ctx) {
  state.queue = queueIds.slice();
  state.ctx = ctx || 'Archive';
  renderQueue(id);
  loadTrack(id, { autoplay: true });
}

export function closePlayer() {
  persistPosition();
  controls.exitFullscreen();
  if (controls.pipActive()) controls.togglePip();
  stopMedia();
  embed.removeAttribute('src');
  clearSleep();
  state.current = null;
  state.index = -1;
  state.ready = false;
  clearMediaSession();
  setMode('closed');
  notify();
}

function goTo(idx, autoplay = true) {
  if (idx < 0 || idx >= state.queue.length) return;
  loadTrack(state.queue[idx], { autoplay });
  if (state.mode === 'full') hooks.open(state.queue[idx], true);
}

function go(delta) {
  const idx = state.index + delta;
  if (idx < 0) {
    if (isLocal()) media.currentTime = 0;
    return;
  }
  if (idx >= state.queue.length) return;
  goTo(idx, true);
}

function toggle() {
  if (!state.current) return;
  if (state.kind === 'embed') return;
  if (media.paused || media.ended) startPlayback();
  else media.pause();
}

function skip(delta) {
  if (!isLocal() || !Number.isFinite(media.duration)) return false;
  media.currentTime = clamp(media.currentTime + delta, 0, media.duration);
  return true;
}

function skipWithFeedback(delta) {
  if (!skip(delta)) return;
  if (state.kind === 'audio') controls.hud(`${delta < 0 ? '−' : '+'}${Math.abs(delta)} s`);
  else controls.flashSkip(delta < 0 ? -1 : 1, Math.abs(delta));
}

function jumpToFraction(f) {
  if (!isLocal() || !Number.isFinite(media.duration)) return;
  media.currentTime = media.duration * clamp(f, 0, 1);
}

function setSeekMax(total) {
  seekMax = total > 0 ? Math.floor(total) : 0;
  seekbar.set({ max: seekMax, time: media.currentTime || 0 });
  stage.classList.toggle('is-long', seekMax >= 3600);
  $('#tDur').textContent = fmtTime(total);
  paintSeek();
}

function bufferedEnd() {
  const t = media.currentTime || 0;
  try {
    const b = media.buffered;
    for (let i = 0; i < b.length; i++) if (b.start(i) <= t + 0.75 && b.end(i) >= t) return b.end(i);
  } catch (e) {}
  return t;
}

function paintSeek() {
  const t = media.currentTime || 0;
  seekbar.set({ time: t, buffered: bufferedEnd() });
  const pct = seekMax ? clamp((t / seekMax) * 100, 0, 100) : 0;
  $('#miniBar').style.setProperty('--p', pct + '%');
}

function updateTime() {
  const t = media.currentTime || 0;
  if (!state.seeking) {
    $('#tCur').textContent = fmtTime(t);
    seekbar.text(`${fmtSpoken(t)} of ${fmtSpoken(seekMax)}`);
  }
  paintSeek();
}

function syncTransportState() {
  const isMedia = isLocal();
  const playing = isMedia && !media.paused && !media.ended;
  const ended = isMedia && !!state.current && media.ended;
  const label = playing ? 'Pause' : ended ? 'Replay' : 'Play';
  const name = playing ? 'pause' : ended ? 'replay' : 'play';
  for (const b of [...$$('.js-toggle', stage), $('#miniToggle')]) {
    b.setAttribute('aria-label', label);
    b.dataset.playing = playing ? 'true' : 'false';
    b.innerHTML = icon(name);
  }
  player.classList.toggle('is-playing', playing);
  stage.classList.toggle('is-playing', playing);
  stage.classList.toggle('is-ended', ended);
  $$('[data-act="prev"]').forEach((b) => (b.disabled = false));
  $$('[data-act="next"]').forEach((b) => (b.disabled = state.index >= state.queue.length - 1));
  if (playing) controls.reschedule();
  else controls.show();
}

let spinnerTimer;
function showSpinner(on) {
  clearTimeout(spinnerTimer);
  if (!on) {
    spinner.hidden = true;
    stage.classList.remove('is-loading');
    return;
  }
  spinnerTimer = setTimeout(() => {
    spinner.hidden = false;
    stage.classList.add('is-loading');
  }, 350);
}

function showMessage(text, actions) {
  msgText.textContent = text;
  msgActions.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = a.label;
    b.addEventListener('click', a.run);
    msgActions.appendChild(b);
  }
  msg.hidden = false;
  stage.classList.add('is-failed');
}

function hideMessage() {
  msg.hidden = true;
  stage.classList.remove('is-failed');
}

onMedia('loadstart', () => showSpinner(true));
onMedia('loadedmetadata', () => {
  state.ready = true;
  const d = media.duration;
  if (Number.isFinite(d)) {
    store.setDuration(state.current.id, d);
    setSeekMax(d);
  }
  if (state.pendingSeek > 0 && Number.isFinite(d) && state.pendingSeek < d - 20) {
    const t = state.pendingSeek;
    media.currentTime = t;
    if (!state.quietResume) toast(`Resumed at ${fmtTime(t)}`, { label: 'Start over', run: () => (media.currentTime = 0) });
  }
  state.pendingSeek = 0;
  state.quietResume = false;
  updateTime();
  syncPosition();
  notify();
});
onMedia('canplay', () => showSpinner(false));
onMedia('loadeddata', () => {
  if (media.paused) showSpinner(false);
});
onMedia('playing', () => {
  showSpinner(false);
  hideMessage();
  if (!state.counted && state.current) {
    state.counted = true;
    store.pushHistory(state.current.id);
  }
});
onMedia('waiting', () => showSpinner(true));
onMedia('seeking', () => showSpinner(true));
onMedia('seeked', () => {
  showSpinner(false);
  updateTime();
  syncPosition();
});
onMedia('play', () => {
  setSessionState('playing');
  syncTransportState();
  syncPosition();
  notify();
});
onMedia('pause', () => {
  setSessionState('paused');
  persistPosition();
  syncTransportState();
  syncPosition();
  notify();
});
onMedia('ratechange', () => {
  $('#speedLabel').textContent = `${media.playbackRate}×`;
  syncPosition();
});
onMedia('progress', paintSeek);
onMedia('durationchange', () => {
  const d = media.duration;
  if (Number.isFinite(d) && d > 0) setSeekMax(d);
});

const savePositionSoon = throttle(() => persistPosition(), 5000);
const syncPositionSoon = throttle(() => syncPosition(), 10000);
onMedia('timeupdate', () => {
  updateTime();
  savePositionSoon();
  syncPositionSoon();
  checkSleep();
});

onMedia('ended', () => {
  const m = state.current;
  if (!m) return;
  store.clearPosition(m.id);
  syncTransportState();
  controls.show();
  if (state.sleep && state.sleep.end) {
    clearSleep();
    toast('Sleep timer finished');
    return;
  }
  const after = store.pref('after');
  if (after === 'repeat') {
    media.currentTime = 0;
    startPlayback();
  } else if (after === 'next' && state.index < state.queue.length - 1) {
    goTo(state.index + 1, true);
  }
});

onMedia('error', () => {
  if (!media.getAttribute('src') || !state.current) return;
  state.failed = true;
  showSpinner(false);
  syncTransportState();
  const id = state.current.id;
  const isAudio = state.kind === 'audio';
  const actions = [{ label: 'Try again', run: () => loadTrack(id, { autoplay: true }) }];
  if (isAudio) {
    actions.push({
      label: 'Play video instead',
      run: () => {
        store.setPlayAs('archive');
        loadTrack(id, { autoplay: true });
      }
    });
  } else if (state.kind === 'media') {
    actions.push({
      label: 'Use Google Drive',
      run: () => {
        store.setPlayAs('drive');
        loadTrack(id, { autoplay: true });
      }
    });
  }
  showMessage(`This ${isAudio ? 'audio' : 'video'} could not be loaded from the Internet Archive.`, actions);
  if (state.mode === 'mini') {
    toast('Playback failed', { label: 'Details', run: () => hooks.open(id, false) });
  }
});

onMedia('volumechange', () => {
  if (state.fadeBase !== null) return;
  store.setPref('volume', media.volume);
  store.setPref('muted', media.muted);
  paintVolume();
});

function persistPosition() {
  const m = state.current;
  if (!m || !isLocal() || !state.ready || media.ended) return;
  const t = media.currentTime;
  const d = media.duration;
  if (!Number.isFinite(t) || t < 1) return;
  store.savePosition(m.id, t, d);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistPosition();
});
window.addEventListener('pagehide', persistPosition);

const volumeInput = $('#volume');
const muteBtn = $('[data-act="mute"]', stage);
const canSetVolume = (() => {
  try {
    const a = document.createElement('audio');
    a.volume = 0.5;
    return a.volume === 0.5;
  } catch (e) {
    return false;
  }
})();
stage.classList.toggle('no-volume', !canSetVolume);

function paintVolume() {
  const v = media.muted ? 0 : media.volume;
  volumeInput.value = String(v);
  volumeInput.style.setProperty('--v', v * 100 + '%');
  muteBtn.innerHTML = icon(v === 0 ? 'mute' : v < 0.5 ? 'volume-low' : 'volume');
  muteBtn.setAttribute('aria-label', media.muted ? 'Unmute' : 'Mute');
}

function setVolume(v, announceIt = false) {
  media.volume = clamp(v, 0, 1);
  media.muted = media.volume === 0;
  paintVolume();
  if (announceIt) controls.hud(media.muted ? 'Muted' : `Volume ${Math.round(media.volume * 100)}%`);
}

function toggleMute(announceIt = false) {
  media.muted = !media.muted;
  if (!media.muted && media.volume === 0) media.volume = 0.5;
  paintVolume();
  if (announceIt) controls.hud(media.muted ? 'Muted' : `Volume ${Math.round(media.volume * 100)}%`);
}

applyPlaybackPrefs(videoEl);
applyPlaybackPrefs(audioEl);
volumeInput.addEventListener('input', () => setVolume(Number(volumeInput.value)));
paintVolume();

let sleepTimer = null;

function setSleep(opt) {
  clearSleep(false);
  if (opt.min) state.sleep = { endsAt: Date.now() + opt.min * 60000, end: false, opt };
  else if (opt.end) state.sleep = { endsAt: 0, end: true, opt };
  if (state.sleep) {
    sleepTimer = setInterval(checkSleep, 1000);
    toast(opt.end ? 'Playback will stop when this meditation ends' : `Sleep timer set for ${opt.label}`);
  }
  paintSleep();
}

function clearSleep(repaint = true) {
  clearInterval(sleepTimer);
  sleepTimer = null;
  state.sleep = null;
  restoreVolume();
  if (repaint) paintSleep();
}

function endOfTrackReset() {
  if (state.sleep && state.sleep.end) {
    state.sleep = null;
    clearInterval(sleepTimer);
    sleepTimer = null;
    paintSleep();
  }
}

function restoreVolume() {
  if (state.fadeBase !== null) {
    media.volume = state.fadeBase;
    state.fadeBase = null;
  }
}

function checkSleep() {
  const s = state.sleep;
  if (!s) return;
  if (s.end) {
    paintSleep();
    return;
  }
  const left = s.endsAt - Date.now();
  if (left <= 0) {
    media.pause();
    clearSleep();
    toast('Sleep timer finished');
    return;
  }
  if (left <= FADE_MS && !media.paused) {
    if (state.fadeBase === null) state.fadeBase = media.volume;
    media.volume = clamp(state.fadeBase * (left / FADE_MS), 0, 1);
  }
  paintSleep();
}

function paintSleep() {
  const s = state.sleep;
  const label = $('#sleepLabel');
  const btn = $('#btnSleep');
  if (!s) {
    label.hidden = true;
    label.textContent = '';
    btn.classList.remove('is-on');
    btn.setAttribute('aria-label', 'Sleep timer');
    return;
  }
  let text;
  if (s.end) text = 'At end';
  else {
    const mins = Math.max(1, Math.ceil((s.endsAt - Date.now()) / 60000));
    text = mins >= 60 ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m` : `${mins} min`;
  }
  label.textContent = text;
  label.hidden = false;
  btn.classList.add('is-on');
  btn.setAttribute('aria-label', `Sleep timer: ${text}`);
}

function renderTools() {
  const m = state.current;
  if (!m) return;
  const src = state.src || resolveSource(m);
  const dl = $('#toolDownload');
  const local = src.kind !== 'embed';
  dl.href = local ? src.url : sources.driveDownload(m);
  const ext = local ? (src.url.match(/\.(\w{2,4})$/) || [])[1] : null;
  dl.setAttribute('download', `${m.title}.${ext ? ext.toLowerCase() : 'mp4'}`);
  $('#speedLabel').textContent = `${media.playbackRate || store.pref('speed')}×`;
  const a = AFTER.find((x) => x.value === store.pref('after')) || AFTER[0];
  $('#toolAfterLabel').textContent = a.short;
  $('#toolAfter').querySelector('svg').innerHTML = `<use href="#i-${a.icon}"/>`;
  const how = src.kind === 'audio' ? 'Audio' : src.kind === 'media' ? 'Archive' : 'Drive';
  $('#toolSourceLabel').textContent = how;
  $('#toolSource').setAttribute('aria-label', `Play as: ${how}`);
  $('#toolSource').querySelector('svg').innerHTML = `<use href="#i-${src.kind === 'audio' ? 'headphones' : 'source'}"/>`;
  $('#toolFav').setAttribute('aria-pressed', store.isFav(m.id) ? 'true' : 'false');
}

$('#btnSpeed').addEventListener('click', (e) => {
  controls.show();
  openMenu(
    e.currentTarget,
    $('#menuSpeed'),
    SPEEDS.map((v) => ({ label: v === 1 ? 'Normal' : `${v}×`, value: v, checked: v === media.playbackRate })),
    (it) => {
      store.setPref('speed', it.value);
      media.defaultPlaybackRate = it.value;
      media.playbackRate = it.value;
    }
  );
});

$('#btnSleep').addEventListener('click', (e) => {
  controls.show();
  const s = state.sleep;
  openMenu(
    e.currentTarget,
    $('#menuSleep'),
    SLEEP.map((o) => ({
      label: o.label,
      opt: o,
      checked: !s ? !o.min && !o.end : s.opt === o
    })),
    (it) => (it.opt.min || it.opt.end ? setSleep(it.opt) : clearSleep())
  );
});

$('#toolAfter').addEventListener('click', (e) =>
  openMenu(
    e.currentTarget,
    $('#menuAfter'),
    AFTER.map((a) => ({ label: a.label, value: a.value, checked: a.value === store.pref('after') })),
    (it) => {
      store.setPref('after', it.value);
      renderTools();
    }
  )
);

function playingAs() {
  return state.kind === 'audio' ? 'audio' : state.kind === 'embed' ? 'drive' : 'archive';
}

$('#toolSource').addEventListener('click', (e) => {
  const m = state.current;
  if (!m) return;
  const hasArchive = !!sources.archive(m);
  const hasAudio = !!sources.audio(m);
  const cur = playingAs();
  openMenu(
    e.currentTarget,
    $('#menuSource'),
    [
      { label: hasArchive ? 'Video · Internet Archive' : 'Video · Internet Archive (not yet)', value: 'archive', checked: cur === 'archive', disabled: !hasArchive },
      { label: 'Video · Google Drive', value: 'drive', checked: cur === 'drive' },
      { label: hasAudio ? 'Audio only' : 'Audio only (not yet)', value: 'audio', checked: cur === 'audio', disabled: !hasAudio }
    ],
    (it) => {
      if (it.value === cur && store.playAs() === it.value) return;
      const wasPlaying = playerApi.playing;
      const at = isLocal() && state.ready ? media.currentTime : null;
      store.setPlayAs(it.value);
      loadTrack(m.id, { autoplay: wasPlaying, resumeAt: at });
    },
    'Lock screen controls are not available with Google Drive.'
  );
});

async function share() {
  const m = state.current;
  if (!m) return;
  const url = absUrl('#/watch/' + m.id);
  if (navigator.share) {
    try {
      await navigator.share({ title: m.title, text: m.title, url });
    } catch (e) {}
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('Link copied');
    } catch (err) {
      toast(url, null, 8000);
    }
    ta.remove();
  }
}

async function pip() {
  const ok = await controls.togglePip();
  if (!ok && !controls.pipActive()) toast(controls.pipSupported() ? 'Pop-out is not ready yet' : 'Pop-out is not supported in this browser');
}

const ms = 'mediaSession' in navigator ? navigator.mediaSession : null;

function setHandler(action, fn) {
  if (!ms) return;
  try {
    ms.setActionHandler(action, fn);
  } catch (e) {}
}

function setupMediaSession() {
  if (!ms) return;
  setHandler('play', () => {
    if (isLocal()) startPlayback();
  });
  setHandler('pause', () => media.pause());
  setHandler('stop', () => media.pause());
  setHandler('seekbackward', (d) => skip(-((d && d.seekOffset) || SKIP)));
  setHandler('seekforward', (d) => skip((d && d.seekOffset) || SKIP));
  setHandler('seekto', (d) => {
    if (!isLocal() || !Number.isFinite(d.seekTime)) return;
    if (d.fastSeek && 'fastSeek' in media) media.fastSeek(d.seekTime);
    else media.currentTime = d.seekTime;
    syncPosition();
  });
}

function syncMediaSession() {
  if (!ms) return;
  const m = state.current;
  if (!m || !isLocal()) {
    clearMediaSession();
    return;
  }
  try {
    ms.metadata = new MediaMetadata({
      title: m.main,
      artist: 'Satania Archive',
      album: m.playlists[0] || 'Meditations',
      artwork: [
        { src: absUrl(m.thumb), sizes: '640x360', type: 'image/webp' },
        { src: absUrl('assets/satania-logo.webp'), sizes: '512x512', type: 'image/webp' }
      ]
    });
  } catch (e) {}
  setHandler('previoustrack', state.index > 0 ? () => go(-1) : null);
  setHandler('nexttrack', state.index < state.queue.length - 1 ? () => go(1) : null);
}

function clearMediaSession() {
  if (!ms) return;
  try {
    ms.metadata = null;
    ms.playbackState = 'none';
  } catch (e) {}
  setHandler('previoustrack', null);
  setHandler('nexttrack', null);
}

function setSessionState(s) {
  if (ms && isLocal()) {
    try {
      ms.playbackState = s;
    } catch (e) {}
  }
}

function syncPosition() {
  if (!ms || !ms.setPositionState || !isLocal()) return;
  const d = media.duration;
  if (!Number.isFinite(d) || d <= 0) return;
  try {
    ms.setPositionState({
      duration: d,
      playbackRate: media.playbackRate || 1,
      position: clamp(media.currentTime || 0, 0, d)
    });
  } catch (e) {}
}

player.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (t) {
    switch (t.dataset.act) {
      case 'minimize':
        hooks.close();
        break;
      case 'close':
        closePlayer();
        hooks.close(true);
        break;
      case 'toggle':
        toggle();
        break;
      case 'prev':
        go(-1);
        break;
      case 'next':
        go(1);
        break;
      case 'back':
        skipWithFeedback(-SKIP);
        break;
      case 'fwd':
        skipWithFeedback(SKIP);
        break;
      case 'fav': {
        if (state.current) store.toggleFav(state.current.id);
        break;
      }
      case 'share':
        share();
        break;
      case 'fullscreen':
        controls.toggleFullscreen();
        break;
      case 'pip':
        pip();
        break;
      case 'mute':
        toggleMute();
        break;
    }
    return;
  }
  if (state.mode === 'mini' && (e.target.closest('.player__stage') || e.target.closest('.player__meta'))) {
    hooks.open(state.current.id, false);
  }
});

store.on((what) => {
  if (what === 'favs' && state.current) $('#toolFav').setAttribute('aria-pressed', store.isFav(state.current.id) ? 'true' : 'false');
  if (what === 'prefs' && state.current) renderTools();
});

document.addEventListener('keydown', (e) => {
  if (state.mode !== 'full' || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  const typing = t.matches && t.matches('input:not([type="range"]), textarea, select, [contenteditable]');
  if (typing || isMenuOpen() || document.querySelector('dialog[open]')) return;
  const onButton = t.matches && t.matches('button, a');
  const onVolume = t === volumeInput;
  controls.show();
  switch (e.key) {
    case 'Escape':
      e.preventDefault();
      if (controls.isFullscreen()) controls.exitFullscreen();
      else hooks.close();
      break;
    case ' ':
      if (onButton) return;
      e.preventDefault();
      toggle();
      break;
    case 'k':
    case 'K':
      toggle();
      break;
    case 'j':
    case 'J':
      skipWithFeedback(-SKIP);
      break;
    case 'l':
    case 'L':
      skipWithFeedback(SKIP);
      break;
    case 'ArrowLeft':
      if (onVolume) break;
      e.preventDefault();
      e.shiftKey ? go(-1) : skipWithFeedback(-SKIP);
      break;
    case 'ArrowRight':
      if (onVolume) break;
      e.preventDefault();
      e.shiftKey ? go(1) : skipWithFeedback(SKIP);
      break;
    case 'ArrowUp':
      if (onVolume) break;
      e.preventDefault();
      media.muted = false;
      setVolume(media.volume + 0.1, true);
      break;
    case 'ArrowDown':
      if (onVolume) break;
      e.preventDefault();
      setVolume(media.volume - 0.1, true);
      break;
    case 'Home':
      if (t === seekEl) {
        e.preventDefault();
        jumpToFraction(0);
      }
      break;
    case 'End':
      if (t === seekEl) {
        e.preventDefault();
        jumpToFraction(1);
      }
      break;
    case 'm':
    case 'M':
      toggleMute(true);
      break;
    case 'f':
    case 'F':
      if (state.kind === 'media') controls.toggleFullscreen();
      break;
    case 'n':
    case 'N':
      go(1);
      break;
    case 'p':
    case 'P':
      go(-1);
      break;
    default:
      if (/^[0-9]$/.test(e.key) && !e.shiftKey && !onVolume) {
        jumpToFraction(Number(e.key) / 10);
        controls.hud(`${Number(e.key) * 10}%`);
      }
  }
});

export function initPlayer(h) {
  hooks = h;
  setupMediaSession();
  paintSleep();
}

export function getState() {
  return state;
}
