import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = async (name) => JSON.parse(await readFile(path.join(root, name), 'utf8'));
const exists = (p) => access(path.join(root, p)).then(() => true, () => false);

const errors = [];
const warnings = [];
const BASE = 'https://archive.org/download/';

const meditations = await readJSON('meditations.json');
const archive = await readJSON('webarchive.json');
const durations = await readJSON('durations.json').catch(() => ({}));

const seen = new Set();
meditations.forEach((m, i) => {
  const n = i + 1;
  if (!m.id) errors.push(`#${n}: missing id`);
  else if (seen.has(m.id)) errors.push(`#${n}: duplicate id ${m.id}`);
  seen.add(m.id);
  if (!m.title) errors.push(`#${n}: missing title`);
  if (!Array.isArray(m.playlists) || !m.playlists.length) warnings.push(`#${n}: no playlists`);
});

const byId = new Map();
archive.forEach((w, i) => {
  const label = `webarchive entry ${i + 1}${w.title ? ` (${w.title})` : ''}`;
  if (!w.id) return errors.push(`${label}: missing id`);
  if (byId.has(w.id)) errors.push(`${label}: duplicate id ${w.id}`);
  byId.set(w.id, w);
  if (!seen.has(w.id)) errors.push(`${label}: id not found in meditations.json`);
  if (w.url && !w.url.startsWith(BASE)) errors.push(`${label}: url does not start with ${BASE}`);
  if (w.audio) {
    if (!w.audio.startsWith(BASE)) errors.push(`${label}: audio does not start with ${BASE}`);
    if (!/\.mp3$/i.test(w.audio)) errors.push(`${label}: audio is not an .mp3 link`);
  }
});

for (let i = 0; i < meditations.length; i++) {
  const m = meditations[i];
  const n = i + 1;
  const w = byId.get(m.id);
  if (!w) {
    warnings.push(`#${n} ${m.title}: not in webarchive.json (plays through Google Drive only)`);
    continue;
  }
  if (!w.url) warnings.push(`#${n} ${m.title}: no video link`);
  if (!w.audio) warnings.push(`#${n} ${m.title}: no audio link`);
  const thumb = `assets/thumbs/${String(n).padStart(3, '0')}.webp`;
  if (!(await exists(thumb))) warnings.push(`#${n} ${m.title}: missing ${thumb}`);
  if (!durations[m.id]) warnings.push(`#${n} ${m.title}: no duration yet`);
}

const quiet = warnings.filter((w) => !w.endsWith('no duration yet'));
const noDur = warnings.length - quiet.length;
console.log(`${meditations.length} meditations, ${archive.length} webarchive entries`);
if (quiet.length) console.log(`\nWarnings (${quiet.length}):\n  ${quiet.join('\n  ')}`);
if (noDur) console.log(`\n${noDur} without a duration yet (run node tools/measure-durations.mjs)`);
if (errors.length) {
  console.log(`\nErrors (${errors.length}):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log('\nNo errors.');
