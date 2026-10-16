import { createApp } from './app';
async function main() {
  const app = await createApp();
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4300), '127.0.0.1');
  console.log(`Game Feedback API listening on http://127.0.0.1:${process.env.PORT ?? 4300}`);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
