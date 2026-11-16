import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Profile } from '../../core/profile.ts';

// A checkpoint alone does not freeze its candidate geometry, priors or perception.
// Refuse to mix games when any runtime source, contract, reference or profile changes.
export async function behaviorIdentity(
  profile: Profile,
  root = fileURLToPath(new URL('../../../', import.meta.url)),
): Promise<string> {
  const files = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true });
    const groups = await Promise.all(
      entries.map(async (entry) => {
        if (entry.name === '__pycache__') return [];
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return files(path);
        if (/(?:\.spec\.ts|\.test\.ts|_test\.py|\.pyc)$/.test(entry.name)) return [];
        return [path];
      }),
    );
    return groups.flat();
  };
  const paths = (
    await Promise.all(
      ['src', 'python/clash_bot', 'contracts', 'assets/counterpush'].map((path) => files(join(root, path))),
    )
  )
    .flat()
    .toSorted();
  const hash = createHash('sha256').update('counterpush-behavior-v1\n').update(JSON.stringify(profile));
  for (const path of paths)
    hash
      .update(relative(root, path))
      .update('\0')
      .update(await readFile(path))
      .update('\0');
  return hash.digest('hex');
}
