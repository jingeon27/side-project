import EmbeddedPostgres from 'embedded-postgres';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
async function main() {
  const database = new EmbeddedPostgres({
    databaseDir: resolve('.data/postgres'),
    user: 'contest',
    password: 'contest',
    port: Number(process.env.LOCAL_POSTGRES_PORT ?? 55432),
    persistent: true,
  });
  if (!existsSync(resolve('.data/postgres/PG_VERSION'))) await database.initialise();
  await database.start();
  try {
    await database.createDatabase('photo_contest');
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('already exists')) throw error;
  }
  console.log(`PostgreSQL ready on 127.0.0.1:${process.env.LOCAL_POSTGRES_PORT ?? 55432}. Stop with Ctrl+C.`);
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
