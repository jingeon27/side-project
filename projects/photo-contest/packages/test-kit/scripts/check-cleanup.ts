import { createDatabaseClient, loadProjectEnv, resolveTestDatabaseUrl } from '../src/index';

async function main() {
  loadProjectEnv();
  const db = createDatabaseClient(resolveTestDatabaseUrl());
  try {
    const schemas = await db.$queryRaw<Array<{ nspname: string }>>`
      SELECT nspname FROM pg_namespace
      WHERE nspname ~ '^(api_test_|web_api_|mobile_api_|web_e2e_|mobile_e2e_)'
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
