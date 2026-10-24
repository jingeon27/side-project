import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createPrismaAdapter } from './prisma-adapter';

const url = 'postgresql://test:secret@127.0.0.1:1/test?schema=isolated_test';

describe('Prisma PostgreSQL adapter', () => {
  it('ORM과 raw SQL에 같은 격리 스키마를 쓰고 연결 수·대기 제한을 지켜야 한다', async () => {
    const adapter = await createPrismaAdapter(`${url}&connection_limit=1&pool_timeout=2`).connect();
    try {
      expect(adapter.getConnectionInfo().schemaName).toBe('isolated_test');
      expect(adapter.underlyingDriver().options).toMatchObject({
        max: 1,
        connectionTimeoutMillis: 2000,
        options: '-c search_path=isolated_test',
      });
    } finally {
      await adapter.dispose();
    }
  });

  it('서버 CA를 클라이언트 인증서로 해석하지 않고 엄격하게 검증해야 한다', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'prisma-ca-'));
    const certificate = join(directory, 'ca.pem');
    writeFileSync(certificate, 'test server CA');
    try {
      const target = new URL(url);
      target.searchParams.set('sslmode', 'require');
      target.searchParams.set('sslaccept', 'strict');
      target.searchParams.set('sslcert', certificate);
      const adapter = await createPrismaAdapter(target.toString()).connect();
      try {
        const pool = adapter.underlyingDriver();
        expect(pool.options.ssl).toEqual({ ca: 'test server CA', rejectUnauthorized: true });
        expect(new URL(pool.options.connectionString ?? '').searchParams.has('sslcert')).toBe(false);
      } finally {
        await adapter.dispose();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('스키마 격리를 덮어쓰는 options와 잘못된 연결 제한을 거부해야 한다', () => {
    expect(() => createPrismaAdapter(`${url}&options=-csearch_path=public`)).toThrow('isolated schema');
    expect(() => createPrismaAdapter(`${url}&connection_limit=0`)).toThrow('connection_limit');
    expect(() => createPrismaAdapter(`${url}&pool_timeout=invalid`)).toThrow('pool_timeout');
  });
});
