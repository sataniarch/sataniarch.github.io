import { $, $$, esc, fmtTime, highlight, icon, num3, debounce } from './util.js';
import { catalog, filterItems, FEATURED } from './data.js';
import { store } from './store.js';
import { playerApi } from './player.js';

const CHUNK = 48;

let nav = null;
let startTrack = null;
let current = { name: null, key: '' };
let archive = { playlist: null, q: '', sort: 'num', list: [], tokens: [], shown: 0 };

const els = {
  grid: $('#grid'),
  sentinel: $('#sentinel'),
  chips: $('#chips'),
  status: $('#status'),
  empty: $('#emptyState'),
  loading: $('#loadingState'),
  title: $('#archiveTitle'),
  sub: $('#archiveSub'),
  playAll: $('#playAll'),
  search: $('#searchInput'),
  sort: $('#sortSelect'),
  plGrid: $('#plGrid'),
  plSort: $('#plSort'),
  library: $('#libraryBody')
};

const contexts = new WeakMap();

export function archiveHash({ playlist, q, sort }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (sort && sort !== 'num') params.set('sort', sort);
  const qs = params.toString();
  const base = playlist ? '#/playlist/' + encodeURIComponent(playlist) : '#/';
  return qs ? `${base}?${qs}` : base;
}

function cardHTML(m, tokens = []) {
  const dur = store.duration(m.id);
  const frac = store.progressFraction(m.id);
  const fav = store.isFav(m.id);
  const tags = m.playlists.map((p) => `<span class="tag">${esc(p)}</span>`).join('');
  const isCur = playerApi.current && playerApi.current.id === m.id;
  return `<article class="card${isCur ? ' is-current' : ''}" data-id="${esc(m.id)}">
  <a class="card__link" href="#/watch/${esc(m.id)}" aria-label="Play ${esc(m.title)}">
    <div class="card__thumb">
      <img src="${esc(m.thumb)}" alt="" width="320" height="180" loading="lazy" decoding="async">
      <span class="card__num mono">No. ${num3(m.num)}${icon('headphones', 'card__mode')}</span>
      ${dur ? `<span class="card__dur mono">${fmtTime(dur)}</span>` : ''}
      <span class="card__glyph" aria-hidden="true"><svg viewBox="0 0 46 46"><circle cx="23" cy="23" r="21"/><path class="gl-play" d="M18,14 L32,23 L18,32 Z"/><g class="gl-audio"><path d="M14.5 26v-3a8.5 8.5 0 0 1 17 0v3"/><rect x="13.5" y="25.5" width="4.5" height="7" rx="1.4"/><rect x="28" y="25.5" width="4.5" height="7" rx="1.4"/></g></svg></span>
      ${frac ? `<span class="card__progress" aria-hidden="true"><span style="width:${Math.round(frac * 100)}%"></span></span>` : ''}
    </div>
    <div class="card__body">
      <p class="card__title">${highlight(m.main, tokens)}</p>
      ${m.sub ? `<p class="card__sub">${highlight(m.sub, tokens)}</p>` : ''}
      <div class="card__tags">${tags}</div>
    </div>
  </a>
  <button class="fav" type="button" data-fav="${esc(m.id)}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from favorites' : 'Add to favorites'}: ${esc(m.main)}">${icon('heart')}</button>
</article>`;
}

function bindCards(container, getContext) {
  container.addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      e.preventDefault();
      store.toggleFav(fav.dataset.fav);
      return;
    }
    const link = e.target.closest('.card__link');
    if (!link) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const id = link.closest('.card').dataset.id;
    const ctx = getContext(link);
    startTrack(id, ctx.ids, ctx.label);
  });
  container.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (img.tagName !== 'IMG' || img.classList.contains('is-fallback')) return;
      img.classList.add('is-fallback');
      img.removeAttribute('width');
      img.removeAttribute('height');
      img.src = 'assets/satania-logo.webp';
    },
    true
  );
}

function syncFavs() {
  $$('.card').forEach((card) => {
    const id = card.dataset.id;
    const btn = card.querySelector('.fav');
    const on = store.isFav(id);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const m = catalog.byId.get(id);
    btn.setAttribute('aria-label', `${on ? 'Remove from favorites' : 'Add to favorites'}: ${m.main}`);
  });
}

export function markCurrent() {
  const id = playerApi.current && playerApi.current.id;
  $$('.card').forEach((c) => c.classList.toggle('is-current', c.dataset.id === id));
}

function renderChips() {
  const { playlist, q, sort } = archive;
  const names = FEATURED.filter((p) => catalog.playlists.some((x) => x.name === p));
  if (playlist && !names.includes(playlist)) names.push(playlist);
  const link = (label, pl, active) =>
    `<a class="chip" href="${archiveHash({ playlist: pl, q, sort })}"${active ? ' aria-current="true"' : ''}>${esc(label)}</a>`;
  els.chips.innerHTML =
    link('All', null, !playlist) +
    names.map((n) => link(n, n, n === playlist)).join('') +
    `<a class="chip chip--more" href="#/playlists">All playlists</a>`;
}

function renderStatus() {
  const total = catalog.items.length;
  const shown = archive.list.length;
  const { playlist, q } = archive;
  if (!playlist && !q.trim()) {
    els.status.innerHTML = `<span>${total} meditations in the archive</span>`;
    return;
  }
  const parts = [`<strong>${shown}</strong> of ${total} shown`];
  if (playlist) parts.push(`playlist: <strong>${esc(playlist)}</strong>`);
  if (q.trim()) parts.push(`search: <strong>“${esc(q.trim())}”</strong>`);
  els.status.innerHTML = parts.join(' &nbsp;·&nbsp; ') + ' <button type="button" id="resetFilters">Reset</button>';
}

function renderHead() {
  const { playlist, list } = archive;
  els.title.textContent = playlist || 'Archive';
  els.sub.textContent = playlist ? 'Playlist' : '';
  els.playAll.hidden = list.length === 0;
  document.title = (playlist ? playlist + ' — ' : '') + 'Satania Archive' + (playlist ? '' : ' — The Light and The Darkness');
}

function renderGridChunk() {
  const next = archive.list.slice(archive.shown, archive.shown + CHUNK);
  if (!next.length) return;
  els.grid.insertAdjacentHTML('beforeend', next.map((m) => cardHTML(m, archive.tokens)).join(''));
  archive.shown += next.length;
}

function renderList() {
  const { list, tokens } = filterItems({ playlist: archive.playlist, query: archive.q, sort: archive.sort });
  archive.list = list;
  archive.tokens = tokens;
  archive.shown = 0;
  els.grid.innerHTML = '';
  els.empty.hidden = list.length !== 0;
  renderStatus();
  renderHead();
  renderGridChunk();
  observeSentinel();
}

let observer = null;
function observeSentinel() {
  if (!('IntersectionObserver' in window)) {
    while (archive.shown < archive.list.length) renderGridChunk();
    return;
  }
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && archive.shown < archive.list.length) {
          renderGridChunk();
          observer.unobserve(els.sentinel);
          requestAnimationFrame(() => observer.observe(els.sentinel));
        }
      },
      { rootMargin: '900px 0px' }
    );
  }
  observer.unobserve(els.sentinel);
  observer.observe(els.sentinel);
}

function showArchive(route) {
  archive.playlist = route.playlist || null;
  archive.q = route.q || '';
  archive.sort = route.sort || 'num';
  if (els.search.value !== archive.q) els.search.value = archive.q;
  els.sort.value = archive.sort;
  els.loading.hidden = true;
  renderChips();
  renderList();
}

const onSearch = debounce(() => {
  archive.q = els.search.value;
  nav.replace(archiveHash(archive));
  renderChips();
  renderList();
}, 160);

function renderPlaylists() {
  const mode = els.plSort.value;
  let list = catalog.playlists.slice();
  if (mode === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  else if (mode === 'count') list.sort((a, b) => b.count - a.count || a.index - b.index);
  const all = `<a class="pl pl--all" href="#/"><span class="pl__name">All</span><span class="pl__count">${catalog.items.length} meditations</span></a>`;
  els.plGrid.innerHTML =
    all +
    list
      .map(
        (p) =>
          `<a class="pl" href="${archiveHash({ playlist: p.name })}"><span class="pl__idx">Vol. ${String(p.index + 1).padStart(2, '0')}</span><span class="pl__name">${esc(p.name)}</span><span class="pl__count">${p.count} meditation${p.count === 1 ? '' : 's'}</span></a>`
      )
      .join('');
}

function librarySection(title, ids, emptyText, action) {
  const items = ids.map((id) => catalog.byId.get(id)).filter(Boolean);
  const body = items.length
    ? `<div class="grid" data-label="${esc(title)}" data-ids="${esc(JSON.stringify(items.map((m) => m.id)))}">${items.map((m) => cardHTML(m)).join('')}</div>`
    : `<p class="lib-empty">${esc(emptyText)}</p>`;
  return `<section class="lib-section"><div class="lib-head"><h2>${esc(title)}</h2>${items.length && action ? `<button type="button" data-lib="${action}">Clear</button>` : ''}</div>${body}</section>`;
}

function renderLibrary() {
  els.library.innerHTML =
    librarySection('Continue listening', store.progressList().slice(0, 12), 'Nothing in progress. Start a meditation and it will wait for you here.') +
    librarySection('Favorites', store.favorites().filter((id) => catalog.byId.has(id)).reverse(), 'No favorites yet. Tap the heart on any meditation to keep it here.') +
    librarySection('Recently played', store.history().slice(0, 20), 'Nothing played yet.', 'history');
}

function bindAbout() {
  $$('.copy-row').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      const flag = btn.querySelector('.copied');
      const done = () => {
        flag.classList.add('show');
        clearTimeout(btn._t);
        btn._t = setTimeout(() => flag.classList.remove('show'), 1200);
      };
      try {
        await navigator.clipboard.writeText(text);
        done();
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          done();
        } catch (err) {}
        ta.remove();
      }
    });
  });
}

const scrollMemory = new Map();

export function visibleView() {
  return current.name;
}

export function showRoute(route, { pop = false } = {}) {
  const name = route.name;
  const key = name === 'archive' ? archiveHash(route) : '#/' + name;
  if (current.name && current.key === key) return;

  if (current.name) scrollMemory.set(current.key, window.scrollY);

  $$('.view').forEach((v) => (v.hidden = v.dataset.view !== name));
  $$('[data-route]').forEach((a) => {
    if (a.dataset.route === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  if (name === 'archive') showArchive(route);
  else {
    document.title = { playlists: 'Playlists', library: 'Library', about: 'About' }[name] + ' — Satania Archive';
    if (name === 'playlists') renderPlaylists();
    if (name === 'library') renderLibrary();
  }

  const changedView = current.name !== name;
  current = { name, key };
  const y = pop && scrollMemory.has(key) ? scrollMemory.get(key) : 0;
  window.scrollTo(0, y);
  return changedView;
}

export function initViews({ router, onStart }) {
  nav = router;
  startTrack = onStart;

  bindCards(els.grid, () => ({ ids: archive.list.map((m) => m.id), label: archive.playlist || (archive.q ? 'Search results' : 'Archive') }));
  bindCards(els.library, (link) => {
    const grid = link.closest('.grid');
    return { ids: JSON.parse(grid.dataset.ids), label: grid.dataset.label };
  });
  els.library.addEventListener('click', (e) => {
    if (e.target.closest('[data-lib]')) store.clearHistory();
  });

  els.search.addEventListener('input', onSearch);
  els.search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.search.blur();
  });
  els.sort.addEventListener('change', () => {
    archive.sort = els.sort.value;
    nav.replace(archiveHash(archive));
    renderChips();
    renderList();
  });
  els.plSort.addEventListener('change', renderPlaylists);
  els.playAll.addEventListener('click', () => {
    if (!archive.list.length) return;
    const ids = archive.list.map((m) => m.id);
    startTrack(ids[0], ids, archive.playlist || (archive.q ? 'Search results' : 'Archive'));
  });
  els.status.addEventListener('click', (e) => {
    if (e.target.id === 'resetFilters') nav.push('#/');
  });

  store.on((what) => {
    if (what === 'favs') {
      syncFavs();
      if (current.name === 'library') renderLibrary();
    }
    if (what === 'hist' && current.name === 'library') renderLibrary();
  });
  playerApi.onChange(markCurrent);

  bindAbout();
}
