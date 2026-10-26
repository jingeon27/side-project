import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const appRoot = resolve(import.meta.dirname, '..');
const webUrl = new URL(process.env.WEB_ORIGIN || 'http://localhost:3200');
const port = webUrl.port;
const isolated =
  ['localhost', '127.0.0.1'].includes(webUrl.hostname) && Number(port) >= 3300 && Number(port) <= 3399;
const dist = isolated ? `.next/test-${port}` : '.next';
const buildRoot = resolve(appRoot, dist);
const standalone = resolve(buildRoot, 'standalone/projects/photo-contest/apps/web');
await cp(resolve(buildRoot, 'static'), resolve(standalone, dist, 'static'), { recursive: true });
await cp(resolve(appRoot, 'public'), resolve(standalone, 'public'), { recursive: true, force: true }).catch(
  (error) => {
    if (error.code !== 'ENOENT') throw error;
  },
);
process.env.HOSTNAME = '127.0.0.1';
process.env.PORT = port || '3200';
await import(pathToFileURL(resolve(standalone, 'server.js')).href);
