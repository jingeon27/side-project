import { defineConfig } from 'vitest/config';
import { guardDatabaseUrl } from '../../scripts/database-guard.mjs';

if (!process.env.TEST_DATABASE_URL)
  throw new Error('Run yarn workspace @game-feedback/api test to prepare the isolated test database.');
guardDatabaseUrl(process.env.TEST_DATABASE_URL, { test: true });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
