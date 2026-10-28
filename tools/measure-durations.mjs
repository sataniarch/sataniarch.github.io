import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (name, fallback) => {
  try {
    return JSON.parse(await readFile(path.join(root, name), 'utf8'));
  } catch (e) {
    return fallback;
  }
};

const archive = await read('webarchive.json', []);
const durations = await read('durations.json', {});
const todo = archive.filter((w) => w.id && (w.audio || w.url) && !durations[w.id]);

console.log(`${todo.length} meditations to measure, ${Object.keys(durations).length} already known`);

async function measure(item) {
  const { stdout } = await run(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', item.audio || item.url],
    { timeout: 120000 }
  );
  const sec = Math.round(parseFloat(stdout));
  if (!Number.isFinite(sec) || sec <= 0) throw new Error('no duration');
  return sec;
}

let index = 0;
let done = 0;
async function worker() {
  while (index < todo.length) {
    const item = todo[index++];
    try {
      durations[item.id] = await measure(item);
    } catch (e) {
      console.warn(`skipped: ${item.title || item.id}`);
    }
    done++;
    if (done % 10 === 0) console.log(`${done}/${todo.length}`);
  }
}

await Promise.all(Array.from({ length: 4 }, worker));
await writeFile(path.join(root, 'durations.json'), JSON.stringify(durations, null, 2) + '\n');
console.log(`Saved durations.json with ${Object.keys(durations).length} entries`);
