import { fold, splitTitle, num3 } from './util.js';
import { store } from './store.js';

export const FEATURED = [
  'Satan', 'Lucifer', 'Lilith', 'Human Soul Transformation',
  'Angelic Meditations', 'Ahrimanic Yoga', 'Indian Meditations', 'Astro Music Meditations'
];

export const catalog = {
  items: [],
  byId: new Map(),
  playlists: [],
  archiveUrls: {},
  audioUrls: {}
};

async function getJSON(url, optional = false) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(url + ' ' + res.status);
    return await res.json();
  } catch (e) {
    if (optional) return null;
    throw e;
  }
}

export async function loadCatalog() {
  const [raw, archive, durations] = await Promise.all([
    getJSON('meditations.json'),
    getJSON('webarchive.json', true),
    getJSON('durations.json', true)
  ]);

  catalog.archiveUrls = {};
  catalog.audioUrls = {};
  if (Array.isArray(archive)) {
    for (const w of archive) {
      if (!w || !w.id) continue;
      if (w.url) catalog.archiveUrls[w.id] = w.url;
      if (w.audio) catalog.audioUrls[w.id] = w.audio;
    }
  }
  if (durations && typeof durations === 'object') store.seedDurations(durations);

  catalog.items = raw.map((m, i) => {
    const { main, sub } = splitTitle(m.title);
    const playlists = m.playlists || [];
    return {
      id: m.id,
      num: i + 1,
      title: m.title,
      main,
      sub,
      playlists,
      thumb: `assets/thumbs/${num3(i + 1)}.webp`,
      haystack: fold(m.title + ' ' + playlists.join(' '))
    };
  });

  catalog.byId = new Map(catalog.items.map((m) => [m.id, m]));

  const counts = new Map();
  for (const m of catalog.items) for (const p of m.playlists) counts.set(p, (counts.get(p) || 0) + 1);
  catalog.playlists = Array.from(counts, ([name, count], index) => ({ name, count, index }));
}

export const sources = {
  archive: (m) => catalog.archiveUrls[m.id] || null,
  audio: (m) => catalog.audioUrls[m.id] || null,
  drive: (m) => `https://drive.google.com/file/d/${m.id}/preview`,
  driveDownload: (m) => `https://drive.google.com/uc?export=download&id=${m.id}`
};

export function tokensOf(query) {
  return fold(query).split(/\s+/).filter(Boolean);
}

export function filterItems({ playlist, query, sort }) {
  const tokens = tokensOf(query || '');
  let list = catalog.items.filter((m) => {
    if (playlist && !m.playlists.includes(playlist)) return false;
    return tokens.every((t) => m.haystack.includes(t));
  });
  if (sort === 'num-desc') list = list.slice().reverse();
  else if (sort === 'title') list = list.slice().sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
  return { list, tokens };
}
