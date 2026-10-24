import { readFileSync } from 'node:fs';

import { PrismaPg } from '@prisma/adapter-pg';

function numericOption(url: URL, name: string, fallback: number) {
  const value = url.searchParams.get(name);
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error(`Invalid PostgreSQL ${name} option.`);
  return Number(value);
}

/** Prisma URL의 스키마·풀 제한·서버 CA를 pg에 명시적으로 전달한다. */
export function createPrismaAdapter(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get('schema') ?? 'public';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema) || url.searchParams.has('options'))
    throw new Error('PostgreSQL requires an isolated schema without custom options.');
  const max = numericOption(url, 'connection_limit', 10);
  if (max < 1) throw new Error('PostgreSQL connection_limit must be positive.');
  // pg는 풀 대기와 연결에 같은 제한을 쓰므로 명시된 pool_timeout을 우선한다.
  const connectionTimeoutMillis =
    numericOption(url, 'pool_timeout', numericOption(url, 'connect_timeout', 5)) * 1000;
  const certificate = url.searchParams.get('sslcert');
  const ssl = certificate ? { ca: readFileSync(certificate, 'utf8'), rejectUnauthorized: true } : undefined;
  for (const name of ['schema', 'connection_limit', 'pool_timeout', 'connect_timeout', 'sslaccept'])
    url.searchParams.delete(name);
  if (certificate) {
    url.searchParams.delete('sslcert');
    url.searchParams.delete('sslmode');
  }
  return new PrismaPg(
    {
      connectionString: url.toString(),
      max,
      options: `-c search_path=${schema}`,
      connectionTimeoutMillis,
      idleTimeoutMillis: 300_000,
      ...(ssl ? { ssl } : {}),
    },
    { schema },
  );
}
