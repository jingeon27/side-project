import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createApp } = require('../dist/app.js');
const { MediaStorage } = require('../dist/media-storage/media-storage.service.js');
const { validateProductionEnvironment } = require('../dist/config/production.config.js');
validateProductionEnvironment(process.env);
if (process.env.NODE_ENV !== 'production') throw new Error('Maintenance requires NODE_ENV=production.');
const app = await createApp();
try {
  const result = await app.get(MediaStorage).prune();
  console.log(JSON.stringify(result));
  if (result.failed) process.exitCode = 1;
} finally {
  await app.close();
}
