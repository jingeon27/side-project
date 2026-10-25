import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ensureRuntimeSecret } from './runtime-secret';

describe('runtime cache credential', () => {
  it('preserves one private credential across repeated starts and rejects corrupt contents', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gf-cache-secret-'));
    const file = join(directory, 'cache.key');
    try {
      const first = ensureRuntimeSecret(file);
      expect(first).toMatch(/^[a-f0-9]{64}$/);
      expect(ensureRuntimeSecret(file)).toBe(first);
      expect(readFileSync(file, 'utf8')).toBe(first);
      expect(statSync(file).mode & 0o777).toBe(0o600);
      writeFileSync(file, 'corrupt');
      expect(() => ensureRuntimeSecret(file)).toThrow('Runtime cache credential is invalid.');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
