export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function debounce(fn, wait) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function throttle(fn, wait) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
    }
  };
}

export function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return (h ? h + ':' : '') + mm + ':' + String(r).padStart(2, '0');
}

export function fmtSpoken(sec) {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const out = [];
  if (h) out.push(h + (h === 1 ? ' hour' : ' hours'));
  if (m) out.push(m + (m === 1 ? ' minute' : ' minutes'));
  if (!h && !m) out.push(r + (r === 1 ? ' second' : ' seconds'));
  return out.join(' ');
}

const FOLD = /[´’‘`ʼ]/g;
export function fold(s) {
  return String(s).toLowerCase().replace(FOLD, "'");
}

export function splitTitle(title) {
  return { main: String(title).trim(), sub: '' };
}

export function highlight(text, tokens) {
  if (!tokens.length) return esc(text);
  const hay = fold(text);
  const ranges = [];
  for (const t of tokens) {
    let from = 0;
    let i;
    while ((i = hay.indexOf(t, from)) !== -1) {
      ranges.push([i, i + t.length]);
      from = i + t.length;
    }
  }
  if (!ranges.length) return esc(text);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0].slice()];
  for (let k = 1; k < ranges.length; k++) {
    const last = merged[merged.length - 1];
    if (ranges[k][0] <= last[1]) last[1] = Math.max(last[1], ranges[k][1]);
    else merged.push(ranges[k].slice());
  }
  let out = '';
  let pos = 0;
  for (const [a, b] of merged) {
    out += esc(text.slice(pos, a)) + '<mark class="mark">' + esc(text.slice(a, b)) + '</mark>';
    pos = b;
  }
  return out + esc(text.slice(pos));
}

export const icon = (name, cls = '') =>
  `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export const num3 = (n) => String(n).padStart(3, '0');

export function absUrl(path) {
  return new URL(path, document.baseURI).href;
}
