import { $, clamp, icon } from './util.js';
import { menuClosedRecently } from './ui.js';

const IDLE_MS = 3200;
const DOUBLE_MS = 300;
const MULTI_MS = 800;
const MOVE_PX = 14;
const SKIP_FLASH_MS = 650;
const AUDIO_INLINE_MIN = 600;

export function createControls({ stage, media, actions }) {
  const ui = $('#ui');
  const tap = $('#tap');
  const hudEl = $('#hud');
  const pipNote = $('#pipNote');
  const pipBtn = $('#btnPip');
  const toastEl = $('#toast');
  const fsButtons = Array.from(stage.querySelectorAll('[data-act="fullscreen"]'));
  const skipEls = { '-1': $('#skipBack'), 1: $('#skipFwd') };

  const hoverFine = window.matchMedia('(hover:hover) and (pointer:fine)');
  const coarse = window.matchMedia('(pointer:coarse)');

  let active = false;

  let uiOn = false;
  let hideTimer = 0;
  let holds = 0;

  function canHide() {
    if (!actions.isPlaying() || holds > 0 || actions.menuOpen()) return false;
    if (hoverFine.matches && ui.matches(':hover')) return false;
    const a = document.activeElement;
    if (a && ui.contains(a)) {
      try {
        if (a.matches(':focus-visible')) return false;
      } catch (e) {}
    }
    return true;
  }

  function setUI(on) {
    if (uiOn === on) return;
    uiOn = on;
    stage.classList.toggle('ui-on', on);
  }

  function schedule() {
    clearTimeout(hideTimer);
    if (!actions.isPlaying()) return;
    hideTimer = setTimeout(() => {
      if (!active) return;
      if (canHide()) setUI(false);
      else schedule();
    }, IDLE_MS);
  }

  function show() {
    if (!active) return;
    setUI(true);
    schedule();
  }

  function hide() {
    clearTimeout(hideTimer);
    if (actions.isPlaying() && !actions.menuOpen()) setUI(false);
  }

  function hold(on) {
    holds = Math.max(0, holds + (on ? 1 : -1));
    if (!on) schedule();
  }

  let lastMove = 0;
  stage.addEventListener(
    'pointermove',
    (e) => {
      if (!active || e.pointerType === 'touch') return;
      const now = performance.now();
      if (now - lastMove < 80) return;
      lastMove = now;
      show();
    },
    { passive: true }
  );
  stage.addEventListener('pointerdown', () => show(), { passive: true });
  ui.addEventListener('focusin', () => show());
  stage.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && active && actions.isPlaying() && !actions.menuOpen() && holds === 0) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => canHide() && setUI(false), 900);
    }
  });

  let hudTimer = 0;
  function hud(text) {
    hudEl.textContent = text;
    hudEl.classList.add('on');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => hudEl.classList.remove('on'), 900);
  }

  const skipAcc = { '-1': 0, 1: 0 };
  const skipTimer = {};
  function flashSkip(dir, secs) {
    const el = skipEls[dir];
    if (!el) return;
    skipAcc[-dir] = 0;
    if (skipEls[-dir]) {
      clearTimeout(skipTimer[-dir]);
      skipEls[-dir].classList.remove('on');
    }
    skipAcc[dir] += secs;
    el.querySelector('b').textContent = String(skipAcc[dir]);
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(skipTimer[dir]);
    skipTimer[dir] = setTimeout(() => {
      el.classList.remove('on');
      skipAcc[dir] = 0;
    }, SKIP_FLASH_MS);
  }

  let down = null;
  let lastTap = { t: 0, x: 0, y: 0, zone: '' };
  let singleTimer = 0;
  let multiUntil = 0;
  let lastMouseClick = 0;

  const zoneOf = (x, w) => (x < w * 0.33 ? 'left' : x > w * 0.67 ? 'right' : 'center');

  function seekZone(zone) {
    const dir = zone === 'left' ? -1 : 1;
    if (actions.skip(dir * actions.skipBy)) flashSkip(dir, actions.skipBy);
    multiUntil = performance.now() + MULTI_MS;
    show();
  }

  tap.addEventListener('pointerdown', (e) => {
    if (!active) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (menuClosedRecently()) {
      down = null;
      return;
    }
    down = { x: e.clientX, y: e.clientY, id: e.pointerId, uiWas: uiOn };
  });
  tap.addEventListener('pointercancel', () => (down = null));
  tap.addEventListener('pointerup', (e) => {
    if (!down || down.id !== e.pointerId) return;
    const d = down;
    down = null;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > MOVE_PX) return;

    const now = performance.now();

    if (e.pointerType === 'mouse') {
      actions.toggle();
      if (now - lastMouseClick < 320) {
        lastMouseClick = 0;
        toggleFullscreen();
      } else {
        lastMouseClick = now;
      }
      return;
    }

    const rect = stage.getBoundingClientRect();
    const zone = zoneOf(e.clientX - rect.left, rect.width);

    if (zone !== 'center' && now < multiUntil) {
      clearTimeout(singleTimer);
      lastTap.t = 0;
      seekZone(zone);
      return;
    }

    const isDouble =
      lastTap.t && now - lastTap.t < DOUBLE_MS && lastTap.zone === zone && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 90;
    if (isDouble) {
      clearTimeout(singleTimer);
      lastTap.t = 0;
      if (zone === 'center') {
        actions.toggle();
        show();
      } else seekZone(zone);
      return;
    }

    lastTap = { t: now, x: e.clientX, y: e.clientY, zone };
    const uiWas = d.uiWas;
    clearTimeout(singleTimer);
    singleTimer = setTimeout(() => {
      lastTap.t = 0;
      if (!active) return;
      if (uiWas && actions.isPlaying()) hide();
      else show();
    }, DOUBLE_MS);
  });

  function measure() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    stage.dataset.w = w < 420 ? 'xs' : w < 640 ? 's' : w < 900 ? 'm' : w < 1200 ? 'l' : 'xl';
    stage.dataset.h = h < 250 ? 'short' : 'tall';
    stage.dataset.layout = coarse.matches || w < 520 ? 'touch' : 'desk';
    stage.dataset.audioRow = w >= AUDIO_INLINE_MIN ? 'inline' : 'stack';
  }
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(stage);
  else window.addEventListener('resize', measure);
  if (coarse.addEventListener) coarse.addEventListener('change', measure);
  measure();

  const doc = document;
  const fsElement = () => doc.fullscreenElement || doc.webkitFullscreenElement || null;
  const fsEnabled = () => !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
  const requestFs = stage.requestFullscreen || stage.webkitRequestFullscreen;
  const leaveFs = doc.exitFullscreen || doc.webkitExitFullscreen;
  const canNativeFs = () => !!requestFs && fsEnabled();

  let pseudo = false;
  let fsState = false;
  const toastHome = { parent: toastEl.parentNode, next: toastEl.nextSibling };

  const isFullscreen = () => fsElement() === stage || pseudo;

  function syncFs() {
    const on = isFullscreen();
    if (on === fsState) return;
    fsState = on;
    stage.classList.toggle('is-fs', on);
    stage.classList.toggle('is-pseudo-fs', pseudo);
    for (const b of fsButtons) {
      if (b.id === 'btnFs') b.innerHTML = icon(on ? 'fs-exit' : 'fullscreen');
      b.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
    }
    if (on) stage.appendChild(toastEl);
    else toastHome.parent.insertBefore(toastEl, toastHome.next && toastHome.next.parentNode === toastHome.parent ? toastHome.next : null);
    if (!on) unlockOrientation();
    setUI(true);
    schedule();
    if (actions.onFullscreen) actions.onFullscreen(on);
  }
  doc.addEventListener('fullscreenchange', syncFs);
  doc.addEventListener('webkitfullscreenchange', syncFs);

  function lockOrientation() {
    try {
      if (coarse.matches && screen.orientation && screen.orientation.lock) {
        const p = screen.orientation.lock('landscape');
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) {}
  }
  function unlockOrientation() {
    try {
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    } catch (e) {}
  }

  async function enterFullscreen() {
    if (isFullscreen()) return;
    if (document.pictureInPictureElement === media) await document.exitPictureInPicture().catch(() => {});
    if (canNativeFs()) {
      try {
        const p = requestFs.call(stage, { navigationUI: 'hide' });
        if (p && p.then) await p;
        lockOrientation();
        syncFs();
        return;
      } catch (e) {
      }
    }
    pseudo = true;
    syncFs();
  }

  function exitFullscreen() {
    if (fsElement() && leaveFs) {
      try {
        const p = leaveFs.call(doc);
        if (p && p.catch) p.catch(() => {});
      } catch (e) {}
    }
    if (pseudo) {
      pseudo = false;
      syncFs();
    }
  }

  function toggleFullscreen() {
    if (isFullscreen()) exitFullscreen();
    else enterFullscreen();
  }

  const webkitPip = () => typeof media.webkitSupportsPresentationMode === 'function' && media.webkitSupportsPresentationMode('picture-in-picture');
  const pipSupported = () => (!!document.pictureInPictureEnabled && !media.disablePictureInPicture) || webkitPip();
  const pipActive = () => document.pictureInPictureElement === media || media.webkitPresentationMode === 'picture-in-picture';

  async function togglePip() {
    try {
      if (pipActive()) {
        if (document.pictureInPictureElement === media) await document.exitPictureInPicture();
        else media.webkitSetPresentationMode('inline');
        return true;
      }
      if (media.readyState < 1) return false;
      if (isFullscreen()) exitFullscreen();
      if (document.pictureInPictureEnabled && media.requestPictureInPicture) await media.requestPictureInPicture();
      else if (webkitPip()) media.webkitSetPresentationMode('picture-in-picture');
      return true;
    } catch (e) {
      return false;
    }
  }

  function syncPip() {
    const on = pipActive();
    stage.classList.toggle('is-pip', on);
    pipNote.hidden = !on;
    pipBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  media.addEventListener('enterpictureinpicture', syncPip);
  media.addEventListener('leavepictureinpicture', syncPip);
  media.addEventListener('webkitpresentationmodechanged', syncPip);
  pipBtn.hidden = !pipSupported();

  return {
    show,
    hide,
    hold,
    hud,
    flashSkip,
    setActive(on) {
      active = on;
      if (on) {
        measure();
        setUI(true);
        schedule();
      } else {
        clearTimeout(hideTimer);
        clearTimeout(singleTimer);
      }
    },
    isFullscreen,
    toggleFullscreen,
    exitFullscreen,
    togglePip,
    pipActive,
    pipSupported,
    get uiVisible() {
      return uiOn;
    },
    reschedule: schedule
  };
}
