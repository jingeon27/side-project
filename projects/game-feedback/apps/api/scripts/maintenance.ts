import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createApp }: typeof import('../src/app') = require('../dist/app.js');
const {
  MediaStorage,
}: typeof import('../src/media-storage/media-storage.service') = require('../dist/media-storage/media-storage.service.js');
const {
  validateProductionEnvironment,
}: typeof import('../src/config/production.config') = require('../dist/config/production.config.js');
const {
  PostViewsService,
}: typeof import('../src/posts/views/post-views.service') = require('../dist/posts/views/post-views.service.js');
validateProductionEnvironment(process.env);
if (process.env.ENVIRONMENT !== 'production') throw new Error('Maintenance requires NODE_ENV=production.');
const app = await createApp();
try {
  const result = await app.get(MediaStorage).prune();
  const postViewsRemoved = await app.get(PostViewsService).prune();
  console.log(JSON.stringify({ ...result, postViewsRemoved }));
  if (result.failed) process.exitCode = 1;
} finally {
  await app.close();
}
