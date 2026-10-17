import { createApp } from '../app';
import { assertDatabaseUrl } from '../database/database-url';
import { DemoProfileProvider } from '../game-profiles/providers/demo-profile.provider';

async function main() {
  if (process.env.NODE_ENV !== 'test') throw new Error('E2E server requires NODE_ENV=test.');
  const databaseUrl = assertDatabaseUrl(process.env.DATABASE_URL, 'test');
  const port = Number(process.env.PORT);
  if (![4301, 4302, 4353].includes(port) || process.env.WEB_ORIGIN !== `http://127.0.0.1:${port - 1000}`)
    throw new Error('E2E server requires the owned browser-test ports.');
  if (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_SECRET || process.env.SUPERCELL_API_TOKEN)
    throw new Error('E2E server must not use external provider credentials.');
  const app = await createApp({
    databaseUrl,
    demoMode: true,
    rateLimit: false,
    profileProvider: new DemoProfileProvider(),
  });
  app.enableShutdownHooks();
  await app.listen(port, '127.0.0.1');
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'E2E server failed.');
  process.exitCode = 1;
});
