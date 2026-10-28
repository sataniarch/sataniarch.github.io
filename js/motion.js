const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const CAN_ANIMATE = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';

export function motionOn() {
  return CAN_ANIMATE && !document.documentElement.classList.contains('calm') && !reduce.matches;
}

const DOCK_MS = 440;
const EASE_DOCK = 'cubic-bezier(.32,0,.15,1)';
const EASE_OUT = 'cubic-bezier(.2,.7,.2,1)';
const EASE_IN = 'cubic-bezier(.4,0,1,1)';
const SIDES = ['Top', 'Right', 'Bottom', 'Left'];

export function createPlayerMotion({ player, stage, blocked = () => false }) {
  const q = (sel, root = player) => root.querySelector(sel);
  const panel = q('.player__panel');
  const scrim = q('.player__scrim');

  let active = null;

  function begin() {
    active = { anims: [], undo: [] };
    return active;
  }

  function teardown(s) {
    s.anims.forEach((a) => {
      try {
        a.cancel();
      } catch (e) {}
    });
    s.undo.splice(0).reverse().forEach((fn) => {
      try {
        fn();
      } catch (e) {}
    });
  }

  function launch(s) {
    Promise.allSettled(s.anims.map((a) => a.finished)).then(() => {
      if (active === s) {
        active = null;
        teardown(s);
      }
    });
  }

  function settle() {
    if (!active) return;
    const s = active;
    active = null;
    teardown(s);
  }

  const anim = (s, el, frames, opts) => {
    if (!el) return null;
    const a = el.animate(frames, { fill: 'both', ...opts });
    s.anims.push(a);
    return a;
  };

  function fadeIn(s, el, delay, duration, readOpacity = false) {
    if (!el) return;
    const to = readOpacity ? getComputedStyle(el).opacity : 1;
    anim(s, el, [{ opacity: 0 }, { opacity: to }], { duration, delay, easing: 'ease-out' });
  }

  function surface(el) {
    const cs = getComputedStyle(el);
    return {
      r: el.getBoundingClientRect(),
      bg: cs.backgroundColor,
      bw: SIDES.map((s) => cs['border' + s + 'Width']),
      bc: SIDES.map((s) => cs['border' + s + 'Color'])
    };
  }

  function surfaceFrame(s) {
    const f = {
      left: s.r.left + 'px',
      top: s.r.top + 'px',
      width: s.r.width + 'px',
      height: s.r.height + 'px',
      backgroundColor: s.bg
    };
    SIDES.forEach((side, i) => {
      f['border' + side + 'Width'] = s.bw[i];
      f['border' + side + 'Color'] = s.bc[i];
    });
    return f;
  }

  function snapshot(kind, z) {
    const c = player.cloneNode(true);
    ['id', 'role', 'aria-label', 'hidden'].forEach((a) => c.removeAttribute(a));
    c.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    c.querySelectorAll('video, audio, iframe, .vp__tap').forEach((n) => n.remove());
    c.classList.remove('is-morphing');
    c.classList.add('player--snap');
    c.dataset.snap = kind;
    c.setAttribute('aria-hidden', 'true');
    c.inert = true;
    c.style.zIndex = String(z);
    const from = Array.from(player.querySelectorAll('.player__scroll, .player__main, .queue')).map((n) => n.scrollTop);
    return { el: c, from };
  }

  function mount(snap, s) {
    document.body.appendChild(snap.el);
    snap.el.querySelectorAll('.player__scroll, .player__main, .queue').forEach((n, i) => {
      if (snap.from[i]) n.scrollTop = snap.from[i];
    });
    s.undo.push(() => snap.el.remove());
  }

  const fullBoxes = () => {
    const scroll = q('.player__scroll');
    const boxes = [q('.player__top')];
    if (getComputedStyle(scroll).display === 'contents') boxes.push(q('.player__main'), q('.queue'));
    else boxes.push(scroll);
    return boxes;
  };
  const miniBoxes = () => [q('.player__meta'), q('.player__mini-actions'), q('.player__bar')];

  const risePx = () => Math.round(Math.min(56, window.innerHeight * 0.07));

  function openFull(apply) {
    const s = begin();
    apply();
    const y = risePx();
    anim(s, panel, [{ transform: `translateY(${y}px)` }, { transform: 'none' }], { duration: 400, easing: EASE_OUT });
    anim(s, panel, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    anim(s, scrim, [{ opacity: 0 }, { opacity: 1 }], { duration: 340, easing: 'ease-out' });
    launch(s);
  }

  function closeOut(prev, apply) {
    const s = begin();
    const snap = snapshot('close', prev === 'full' ? 500 : 300);
    apply();
    mount(snap, s);
    const p = q('.player__panel', snap.el);
    const sc = q('.player__scrim', snap.el);
    const y = prev === 'full' ? risePx() : 22;
    const ms = prev === 'full' ? 260 : 220;
    anim(s, p, [{ transform: 'none' }, { transform: `translateY(${y}px)` }], { duration: ms, easing: EASE_IN });
    anim(s, p, [{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-in' });
    anim(s, sc, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in' });
    launch(s);
  }

  function flight(prev, next, apply) {
    const down = next === 'mini';
    const s = begin();

    const firstPanel = panel.getBoundingClientRect();
    const firstStage = stage.getBoundingClientRect();
    const snap = snapshot('flight', 299);

    apply();

    const last = surface(panel);
    const lastStage = stage.getBoundingClientRect();
    const dy = down ? last.r.top - firstPanel.top : firstPanel.top - last.r.top;

    mount(snap, s);

    player.classList.add('is-morphing');
    s.undo.push(() => player.classList.remove('is-morphing'));
    const ghost = document.createElement('div');
    ghost.className = 'player__ghost';
    ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, {
      left: last.r.left + 'px',
      top: last.r.top + 'px',
      width: last.r.width + 'px',
      height: last.r.height + 'px',
      backgroundColor: last.bg,
      borderStyle: 'solid',
      borderWidth: last.bw.join(' '),
      borderColor: last.bc.join(' ')
    });
    player.insertBefore(ghost, panel);
    s.undo.push(() => ghost.remove());

    const oldPanel = q('.player__panel', snap.el);
    const oldScrim = q('.player__scrim', snap.el);
    const slide = (el, from, to, extra = {}) =>
      anim(s, el, [{ transform: `translateY(${from}px)` }, { transform: `translateY(${to}px)` }], { duration: DOCK_MS, easing: EASE_DOCK, ...extra });

    if (lastStage.width > 0 && lastStage.height > 0) {
      const sx = firstStage.width / lastStage.width;
      const sy = firstStage.height / lastStage.height;
      const dx = firstStage.left - lastStage.left;
      const ty = firstStage.top - lastStage.top - (down ? 0 : dy);
      anim(
        s,
        stage,
        [
          { transformOrigin: '0 0', transform: `translate(${dx}px,${ty}px) scale(${sx},${sy})` },
          { transformOrigin: '0 0', transform: 'translate(0,0) scale(1,1)' }
        ],
        { duration: DOCK_MS, easing: EASE_DOCK }
      );
    }

    if (down) {
      anim(s, q('.vp__ui', snap.el), [{ opacity: 1 }, { opacity: 0 }], { duration: 90, easing: 'linear' });
      slide(oldPanel, 0, dy);
      anim(s, oldPanel, [{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: DOCK_MS, easing: 'linear' });
      anim(s, oldScrim, [{ opacity: 1 }, { opacity: 0 }], { duration: DOCK_MS * 0.9, easing: 'ease-out' });
      anim(s, ghost, [{ transform: 'translateY(14px)', opacity: 0 }, { transform: 'none', opacity: 1 }], {
        duration: 300,
        delay: DOCK_MS * 0.22,
        easing: EASE_OUT
      });
      miniBoxes().forEach((el) => fadeIn(s, el, DOCK_MS * 0.4, 240));
    } else {
      slide(panel, dy, 0);
      slide(ghost, dy, 0);
      anim(s, ghost, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'linear' });
      anim(s, oldPanel, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in' });
      anim(s, scrim, [{ opacity: 0 }, { opacity: 1 }], { duration: DOCK_MS * 0.9, easing: 'ease-out' });
      fullBoxes().forEach((el) => fadeIn(s, el, DOCK_MS * 0.25, 260));
      fadeIn(s, q('#ui'), DOCK_MS * 0.5, 220, true);
    }
    launch(s);
  }

  function run(prev, next, apply) {
    settle();
    let applied = false;
    const once = () => {
      if (applied) return;
      applied = true;
      apply();
    };
    if (!motionOn() || (prev === 'full' && blocked())) {
      once();
      return;
    }
    try {
      if (prev === 'closed' && next === 'full') openFull(once);
      else if (next === 'closed') closeOut(prev, once);
      else if ((prev === 'full' && next === 'mini') || (prev === 'mini' && next === 'full')) flight(prev, next, once);
      else once();
    } catch (e) {
      settle();
      once();
    }
  }

  return { run, settle };
}
