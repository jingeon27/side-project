import EmbeddedPostgres from 'embedded-postgres';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
async function main() {
  const testing = process.argv.includes('--test');
  const databaseDir = resolve(testing ? '.data/test-postgres' : '.data/postgres');
  const port = Number(
    testing ? (process.env.LOCAL_TEST_POSTGRES_PORT ?? 55434) : (process.env.LOCAL_POSTGRES_PORT ?? 55432),
  );
  const databaseName = testing ? 'photo_contest_test' : 'photo_contest';
  const database = new EmbeddedPostgres({
    databaseDir,
    user: 'contest',
    password: 'contest',
    port,
    persistent: true,
  });
  if (!existsSync(resolve(databaseDir, 'PG_VERSION'))) await database.initialise();
  await database.start();
  try {
    await database.createDatabase(databaseName);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('already exists')) {
      await database.stop();
      throw error;
    }
  }
  console.log(`PostgreSQL ${databaseName} ready on 127.0.0.1:${port}. Stop with Ctrl+C.`);
  async function stop() {
    await database.stop();
    process.exit(0);
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  await new Promise(() => {});
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
