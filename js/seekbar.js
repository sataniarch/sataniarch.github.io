import { clamp, fmtTime } from './util.js';

export function createSeekbar(el, { onStart, onScrub, onCommit } = {}) {
  const tip = el.querySelector('.vp__tip');
  let max = 0;
  let time = 0;
  let scrubbing = false;
  let hoverTime = null;

  const ratioAt = (e) => {
    const r = el.getBoundingClientRect();
    return r.width ? clamp((e.clientX - r.left) / r.width, 0, 1) : 0;
  };

  function placeTip(ratio, t) {
    tip.textContent = fmtTime(t);
    const w = el.clientWidth;
    const half = tip.offsetWidth / 2 || 24;
    const x = clamp(ratio * w, half, Math.max(half, w - half));
    el.style.setProperty('--tx', x + 'px');
  }

  function paint() {
    const pct = max ? clamp((time / max) * 100, 0, 100) : 0;
    el.style.setProperty('--pct', pct + '%');
    el.setAttribute('aria-valuenow', String(Math.floor(time)));
  }

  function scrubTo(e) {
    const ratio = ratioAt(e);
    time = ratio * max;
    paint();
    placeTip(ratio, time);
    if (onScrub) onScrub(time);
  }

  el.addEventListener('pointerdown', (e) => {
    if (!max || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      el.setPointerCapture(e.pointerId);
    } catch (err) {}
    scrubbing = true;
    el.classList.add('is-scrubbing');
    if (onStart) onStart();
    scrubTo(e);
  });

  el.addEventListener('pointermove', (e) => {
    if (scrubbing) {
      scrubTo(e);
      return;
    }
    if (!max || e.pointerType !== 'mouse') return;
    const ratio = ratioAt(e);
    hoverTime = ratio * max;
    el.classList.add('is-hover');
    placeTip(ratio, hoverTime);
  });

  const leave = () => {
    hoverTime = null;
    el.classList.remove('is-hover');
  };
  el.addEventListener('pointerleave', () => {
    if (!scrubbing) leave();
  });

  const finish = (e, commit) => {
    if (!scrubbing) return;
    scrubbing = false;
    el.classList.remove('is-scrubbing');
    try {
      el.releasePointerCapture(e.pointerId);
    } catch (err) {}
    if (e.pointerType !== 'mouse') leave();
    if (commit && onCommit) onCommit(time);
    else if (onCommit) onCommit(null);
  };
  el.addEventListener('pointerup', (e) => finish(e, true));
  el.addEventListener('pointercancel', (e) => finish(e, false));
  el.addEventListener('lostpointercapture', (e) => finish(e, false));

  return {
    get scrubbing() {
      return scrubbing;
    },
    get time() {
      return time;
    },
    set({ time: t, max: m, buffered }) {
      if (typeof m === 'number' && m !== max) {
        max = Math.max(0, m);
        el.setAttribute('aria-valuemax', String(Math.floor(max)));
        el.setAttribute('aria-disabled', max > 0 ? 'false' : 'true');
        el.tabIndex = max > 0 ? 0 : -1;
      }
      if (!scrubbing && typeof t === 'number') {
        time = clamp(t, 0, max || 0);
        paint();
      }
      if (typeof buffered === 'number') {
        const pct = max ? clamp((buffered / max) * 100, 0, 100) : 0;
        el.style.setProperty('--buf', Math.max(pct, max ? (time / max) * 100 : 0) + '%');
      }
    },
    text(t) {
      el.setAttribute('aria-valuetext', t);
    }
  };
}
