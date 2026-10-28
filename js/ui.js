import { $, esc, icon } from './util.js';

const toastEl = $('#toast');
const announcer = $('#announcer');
let toastTimer;

export function toast(message, action, ms = 4200) {
  clearTimeout(toastTimer);
  toastEl.innerHTML = `<span>${esc(message)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      hideToast();
      action.run();
    });
    toastEl.appendChild(b);
  }
  toastEl.classList.add('show');
  toastTimer = setTimeout(hideToast, ms);
}

export function hideToast() {
  clearTimeout(toastTimer);
  toastEl.classList.remove('show');
}

export function announce(text) {
  announcer.textContent = '';
  requestAnimationFrame(() => (announcer.textContent = text));
}

let openMenuState = null;
let menuClosedAt = 0;

export function menuClosedRecently(ms = 250) {
  return performance.now() - menuClosedAt < ms;
}

export function closeMenu(restoreFocus = true) {
  if (!openMenuState) return;
  const { btn, menu, off } = openMenuState;
  openMenuState = null;
  menuClosedAt = performance.now();
  off();
  menu.hidden = true;
  menu.innerHTML = '';
  btn.setAttribute('aria-expanded', 'false');
  if (restoreFocus) btn.focus({ preventScroll: true });
}

export function isMenuOpen() {
  return !!openMenuState;
}

export function openMenu(btn, menu, items, onPick, hint) {
  if (openMenuState && openMenuState.btn === btn) {
    closeMenu();
    return;
  }
  closeMenu(false);

  menu.innerHTML =
    items
      .map(
        (it, i) =>
          `<button type="button" role="menuitemradio" aria-checked="${it.checked ? 'true' : 'false'}" data-i="${i}"${it.disabled ? ' disabled' : ''}><span>${esc(it.label)}</span>${icon('check')}</button>`
      )
      .join('') + (hint ? `<p class="menu__hint">${esc(hint)}</p>` : '');
  menu.hidden = false;
  btn.setAttribute('aria-expanded', 'true');

  const place = () => {
    const r = btn.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    menu.style.left = left + 'px';
    if (r.top > h + 16) {
      menu.style.top = 'auto';
      menu.style.bottom = window.innerHeight - r.top + 6 + 'px';
    } else {
      menu.style.bottom = 'auto';
      menu.style.top = Math.min(r.bottom + 6, window.innerHeight - h - 8) + 'px';
    }
  };
  place();

  const onPointer = (e) => {
    if (!menu.contains(e.target) && !btn.contains(e.target)) closeMenu(false);
  };
  const onKey = (e) => {
    const btns = Array.from(menu.querySelectorAll('button:not(:disabled)'));
    const idx = btns.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      btns[(idx + 1) % btns.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      btns[(idx - 1 + btns.length) % btns.length].focus();
    } else if (e.key === 'Tab') {
      closeMenu(false);
    }
  };
  const onClick = (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    const item = items[Number(b.dataset.i)];
    closeMenu();
    onPick(item);
  };
  const onResize = () => closeMenu(false);

  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('keydown', onKey, true);
  menu.addEventListener('click', onClick);
  window.addEventListener('resize', onResize);

  openMenuState = {
    btn,
    menu,
    off() {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
      menu.removeEventListener('click', onClick);
      window.removeEventListener('resize', onResize);
    }
  };

  const checked = menu.querySelector('[aria-checked="true"]') || menu.querySelector('button');
  if (checked) checked.focus({ preventScroll: true });
}
