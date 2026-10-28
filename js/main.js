import { $ } from './util.js';
import { loadCatalog } from './data.js';
import { createRouter } from './router.js';
import { initViews, showRoute, visibleView } from './views.js';
import { initPlayer, present, dock, start } from './player.js';
import { initSettings, applyCalm, applyPlayback } from './settings.js';
import { store } from './store.js';
import { registerWorker } from './pwa.js';
import { announce } from './ui.js';

applyCalm();
applyPlayback();
store.on((what) => {
  if (what === 'prefs') applyPlayback();
});
registerWorker();

let ready = false;
let first = true;

const router = createRouter((route, opts) => {
  if (!ready) return;
  if (route.name === 'watch') {
    if (!present(route.id)) {
      router.replace('#/');
      return;
    }
    if (!visibleView()) showRoute({ name: 'archive', playlist: null, q: '', sort: 'num' });
    return;
  }
  dock();
  const changed = showRoute(route, opts);
  const initial = first;
  first = false;
  if (changed && !opts.pop && !initial) {
    $('#main').focus({ preventScroll: true });
    announce(document.title);
  }
});

initPlayer({
  open(id, replace) {
    router[replace ? 'replace' : 'push']('#/watch/' + encodeURIComponent(id));
  },
  close() {
    if (!location.hash.startsWith('#/watch/')) return;
    if (router.canGoBack) router.back();
    else router.replace('#/');
  }
});

document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href^="#/"]');
  if (!a || a.target === '_blank') return;
  e.preventDefault();
  router.push(a.getAttribute('href'));
});

async function boot() {
  try {
    await loadCatalog();
  } catch (err) {
    const note = $('#loadingState');
    note.innerHTML = 'The vault could not be opened.<br>Check your connection and reload the page.';
    return;
  }
  initViews({
    router,
    onStart(id, ids, label) {
      start(id, ids, label);
      router.push('#/watch/' + encodeURIComponent(id));
    }
  });
  initSettings();
  ready = true;
  router.start();
}

boot();
