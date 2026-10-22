import {
  createDatabaseClient,
  loadProjectEnv,
  resolveTestDatabaseUrl,
  TEST_SCHEMA_PREFIXES,
} from '../src/index';

async function main() {
  loadProjectEnv();
  const db = createDatabaseClient(resolveTestDatabaseUrl());
  try {
    const pattern = `^(${TEST_SCHEMA_PREFIXES.join('|')})_`;
    const schemas = await db.$queryRaw<Array<{ nspname: string }>>`
      SELECT nspname FROM pg_namespace WHERE nspname ~ ${pattern}
    `;
    if (schemas.length)
      throw new Error(`정리되지 않은 테스트 스키마: ${schemas.map(({ nspname }) => nspname).join(', ')}`);
    console.log('남은 테스트 스키마: 0');
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
