import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { ensureRuntimeSecret } from './runtime-secret';

// The operator `ops` container runs with `read_only: true` and the runtime volume mounted read-only.
// Every write fails there with EROFS (root bypasses chmod, so a permission bit would not reproduce it).
const readOnly = vi.hoisted(() => ({ enabled: false }));
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  const guard =
    <TArgs extends unknown[], TResult>(write: (...args: TArgs) => TResult) =>
    (...args: TArgs) => {
      if (readOnly.enabled) throw Object.assign(new Error('EROFS: read-only file system'), { code: 'EROFS' });
      return write(...args);
    };
  return {
    ...fs,
    mkdirSync: guard(fs.mkdirSync),
    writeFileSync: guard(fs.writeFileSync),
    linkSync: guard(fs.linkSync),
    unlinkSync: guard(fs.unlinkSync),
  };
});

describe('runtime cache credential on a read-only file system', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gf-cache-secret-ro-'));
  afterEach(() => {
    readOnly.enabled = false;
  });
  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  it('reads the key the API already created without writing (maintenance prune in ops)', () => {
    const file = join(directory, 'existing.key');
    const secret = 'b'.repeat(64);
    writeFileSync(file, secret, { mode: 0o600 });
    readOnly.enabled = true;
    expect(ensureRuntimeSecret(file)).toBe(secret);
  });

  it('fails clearly instead of inventing a key when none exists yet', () => {
    readOnly.enabled = true;
    expect(() => ensureRuntimeSecret(join(directory, 'missing', 'cache.key'))).toThrow('EROFS');
  });
});
