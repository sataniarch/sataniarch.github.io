export function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '') || '/';
  const qi = raw.indexOf('?');
  const path = qi === -1 ? raw : raw.slice(0, qi);
  const params = new URLSearchParams(qi === -1 ? '' : raw.slice(qi + 1));
  const parts = path
    .split('/')
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch (e) {
        return p;
      }
    });
  const q = params.get('q') || '';
  const sort = ['num-desc', 'title'].includes(params.get('sort')) ? params.get('sort') : 'num';

  switch (parts[0]) {
    case 'watch':
      return parts[1] ? { name: 'watch', id: parts[1] } : { name: 'archive', playlist: null, q, sort };
    case 'playlist':
      return { name: 'archive', playlist: parts[1] || null, q, sort };
    case 'playlists':
      return { name: 'playlists' };
    case 'library':
      return { name: 'library' };
    case 'about':
      return { name: 'about' };
    default:
      return { name: 'archive', playlist: null, q, sort };
  }
}

export function createRouter(onRoute) {
  let popping = false;

  const handle = () => onRoute(parseHash(location.hash), { pop: popping });

  const router = {
    push(hash) {
      if (hash === location.hash) return;
      popping = false;
      history.pushState({ app: true }, '', hash);
      handle();
    },
    replace(hash) {
      history.replaceState(history.state, '', hash);
      popping = false;
      handle();
    },
    back() {
      history.back();
    },
    get canGoBack() {
      return !!(history.state && history.state.app);
    },
    start() {
      history.scrollRestoration = 'manual';
      window.addEventListener('popstate', () => {
        popping = true;
        handle();
        popping = false;
      });
      handle();
    }
  };
  return router;
}
