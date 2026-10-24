import { createApp } from './app';
import { resolveListenConfig, validateProductionEnvironment } from './config/production.config';
import { initSentry } from './monitoring/sentry';

async function main() {
  initSentry();
  validateProductionEnvironment(process.env);
  const { HOST, PORT } = resolveListenConfig(process.env);
  const app = await createApp();
  app.enableShutdownHooks();
  await app.listen(PORT, HOST);
  console.log(`Game Feedback API listening on port ${PORT}.`);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
