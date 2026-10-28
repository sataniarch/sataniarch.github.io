const PREFIX = 'sa:';
const memory = new Map();

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw !== null) return JSON.parse(raw);
  } catch (e) {
    if (memory.has(key)) return memory.get(key);
  }
  return memory.has(key) ? memory.get(key) : fallback;
}

function write(key, value) {
  memory.set(key, value);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {}
}

const defaults = { mode: 'video', source: 'archive', after: 'next', calm: false, speed: 1, volume: 1, muted: false };

function sanitize(p) {
  const out = { ...p };
  if (out.mode !== 'audio') out.mode = 'video';
  if (out.source !== 'drive') out.source = 'archive';
  if (out.mode === 'audio') out.source = 'archive';
  return out;
}

let prefs = sanitize({ ...defaults, ...read('prefs', {}) });
let favs = new Set(read('favs', []));
let positions = read('pos', {});
let history = read('hist', []);
let durations = read('dur', {});

const listeners = new Set();
const emit = (what) => listeners.forEach((fn) => fn(what));

export const store = {
  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  pref(key) {
    return prefs[key];
  },
  setPref(key, value) {
    prefs[key] = value;
    if (key === 'mode' && value === 'audio') prefs.source = 'archive';
    if (key === 'source' && value === 'drive') prefs.mode = 'video';
    prefs = sanitize(prefs);
    write('prefs', prefs);
    emit('prefs');
  },

  playAs() {
    return prefs.mode === 'audio' ? 'audio' : prefs.source;
  },
  setPlayAs(choice) {
    if (choice === 'audio') prefs.mode = 'audio';
    else {
      prefs.mode = 'video';
      prefs.source = choice === 'drive' ? 'drive' : 'archive';
    }
    prefs = sanitize(prefs);
    write('prefs', prefs);
    emit('prefs');
  },

  isFav(id) {
    return favs.has(id);
  },
  favorites() {
    return Array.from(favs);
  },
  toggleFav(id) {
    if (favs.has(id)) favs.delete(id);
    else favs.add(id);
    write('favs', Array.from(favs));
    emit('favs');
    return favs.has(id);
  },

  position(id) {
    return positions[id] || null;
  },
  savePosition(id, time, total) {
    positions[id] = { t: Math.floor(time), d: Number.isFinite(total) ? Math.floor(total) : 0, at: Date.now() };
    write('pos', positions);
  },
  clearPosition(id) {
    if (positions[id]) {
      delete positions[id];
      write('pos', positions);
      emit('pos');
    }
  },
  progressList() {
    return Object.entries(positions)
      .filter(([, p]) => p.t >= 30 && (!p.d || p.t < p.d - 30))
      .sort((a, b) => b[1].at - a[1].at)
      .map(([id]) => id);
  },
  progressFraction(id) {
    const p = positions[id];
    if (!p || !p.d || p.t < 30 || p.t >= p.d - 30) return 0;
    return p.t / p.d;
  },

  duration(id) {
    return durations[id] || 0;
  },
  setDuration(id, sec) {
    if (!Number.isFinite(sec) || sec <= 0) return;
    const v = Math.floor(sec);
    if (durations[id] === v) return;
    durations[id] = v;
    write('dur', durations);
  },
  seedDurations(map) {
    let changed = false;
    for (const id in map) {
      if (!durations[id] && map[id] > 0) {
        durations[id] = Math.floor(map[id]);
        changed = true;
      }
    }
    if (changed) write('dur', durations);
  },

  history() {
    return history.slice();
  },
  pushHistory(id) {
    history = [id, ...history.filter((x) => x !== id)].slice(0, 40);
    write('hist', history);
    emit('hist');
  },
  clearHistory() {
    history = [];
    write('hist', history);
    emit('hist');
  },

  clearAll() {
    favs = new Set();
    positions = {};
    history = [];
    write('favs', []);
    write('pos', positions);
    write('hist', history);
    emit('favs');
    emit('hist');
    emit('pos');
  }
};
