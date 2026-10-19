import { guardDatabaseUrl } from '../../../scripts/database-guard.mjs';

export default function setup() {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error('Run yarn workspace @game-feedback/api test:integration to prepare its database.');
  guardDatabaseUrl(process.env.TEST_DATABASE_URL, { test: true });
}
