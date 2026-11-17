import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { DEFAULT_PROFILE } from '../../core/profile.ts';
import { behaviorIdentity } from './behavior-identity.ts';

it('prevents resuming frozen evidence after geometry, prior, reference or profile changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'counterpush-behavior-'));
  try {
    for (const directory of ['src', 'python/clash_bot', 'contracts', 'assets/counterpush'])
      await mkdir(join(root, directory), { recursive: true });
    await writeFile(join(root, 'src/policy.ts'), 'rear deployment');
    const original = await behaviorIdentity(DEFAULT_PROFILE, root);
    expect(await behaviorIdentity(DEFAULT_PROFILE, root)).toBe(original);
    for (const path of ['src/policy.test.ts', 'src/policy.fixture.ts', 'python/clash_bot/prior_fixture.py']) {
      await writeFile(join(root, path), 'test only');
      expect(await behaviorIdentity(DEFAULT_PROFILE, root)).toBe(original);
    }
    expect(await behaviorIdentity({ ...DEFAULT_PROFILE, riverY: 276 }, root)).not.toBe(original);
    for (const path of [
      'src/policy.ts',
      'python/clash_bot/prior.py',
      'contracts/decision.json',
      'assets/counterpush/reference.png',
    ]) {
      const before = await behaviorIdentity(DEFAULT_PROFILE, root);
      await writeFile(join(root, path), 'changed behavior');
      expect(await behaviorIdentity(DEFAULT_PROFILE, root)).not.toBe(before);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
