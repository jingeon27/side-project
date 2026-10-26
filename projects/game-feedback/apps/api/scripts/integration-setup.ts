import { guardDatabaseUrl } from '../../../scripts/database-guard.ts';

export default function setup() {
  if (!process.env.DATABASE_URL)
    throw new Error('Run yarn workspace @game-feedback/api test:integration to prepare its database.');
  guardDatabaseUrl(process.env.DATABASE_URL, { test: true });
}
