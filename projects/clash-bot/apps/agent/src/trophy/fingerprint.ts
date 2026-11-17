import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function trophyBehaviorIdentity(evidenceFiles: string[]) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const files = async (directory: string): Promise<string[]> => {
    const rows = await readdir(directory, { withFileTypes: true });
    const groups = await Promise.all(
      rows.map(async (row) => {
        if (row.name === '__pycache__' || /(?:\.test\.ts|\.spec\.ts|_test\.py|\.pyc)$/.test(row.name))
          return [];
        const path = join(directory, row.name);
        return row.isDirectory() ? files(path) : [path];
      }),
    );
    return groups.flat();
  };
  const paths = (await Promise.all(['src', 'python/clash_bot', 'contracts'].map((p) => files(join(root, p)))))
    .flat()
    .toSorted();
  const hash = createHash('sha256').update('trophy-own-observation-behavior-v1\n');
  for (const path of paths)
    hash
      .update(relative(root, path))
      .update('\0')
      .update(await readFile(path))
      .update('\0');
  for (const path of evidenceFiles.toSorted())
    hash
      .update(path)
      .update('\0')
      .update(await readFile(path))
      .update('\0');
  return hash.digest('hex');
}
