import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const appRoot = resolve(import.meta.dirname, '..');
const dist = process.env.NEXT_DIST_DIR || '.next';
const buildRoot = resolve(appRoot, dist);
const standalone = resolve(buildRoot, 'standalone/projects/photo-contest/apps/web');
await cp(resolve(buildRoot, 'static'), resolve(standalone, dist, 'static'), { recursive: true });
await cp(resolve(appRoot, 'public'), resolve(standalone, 'public'), { recursive: true, force: true }).catch(
  (error) => {
    if (error.code !== 'ENOENT') throw error;
  },
);
process.env.HOSTNAME = '127.0.0.1';
await import(pathToFileURL(resolve(standalone, 'server.js')).href);
