/* Copy the web game (../game) into dist/, which Capacitor bundles into the
 * Android app. Tests, tooling and the service worker are left out: the native
 * app already ships every file locally, so it neither needs nor should run the
 * offline service worker. dist/ is generated — it is git-ignored. */
import { rm, mkdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'game');
const dist = join(here, 'dist');

const SKIP = new Set(['tests', '.claude', 'sw.js']);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(src, dist, {
  recursive: true,
  filter: (path) => {
    const rel = path.slice(src.length + 1).split(/[\\/]/)[0];
    return !SKIP.has(rel);
  }
});
console.log('synced web game -> dist (excluded:', [...SKIP].join(', ') + ')');
