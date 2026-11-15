import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { ASSET_MANIFEST, UPSTREAM_REVISION } from './asset-manifest.ts';
import { DEFAULT_PROFILE } from './config.ts';

export function gitBlobHash(bytes: Buffer): string {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

export async function atomicWrite(path: string, bytes: Buffer | string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, bytes, { mode: 0o600 });
  await rename(temporary, path);
}

export async function setupAssets(dataDir: string, profilePath: string): Promise<void> {
  // Sequential small downloads avoid adding a burst of CPU/network work to the game.
  for (const [path, expected] of Object.entries(ASSET_MANIFEST)) {
    const destination = join(dataDir, 'assets', path);
    const cached = await readFile(destination).catch(() => null);
    if (cached && gitBlobHash(cached) === expected) continue;
    const response = await fetch(
      `https://raw.githubusercontent.com/Pbatch/ClashRoyaleBuildABot/${UPSTREAM_REVISION}/clashroyalebuildabot/images/${path}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) throw new Error(`참조 이미지 다운로드 실패 (${response.status}): ${path}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 256_000 || gitBlobHash(bytes) !== expected)
      throw new Error(`참조 이미지 검증 실패: ${path}`);
    await atomicWrite(destination, bytes);
  }
  try {
    await access(profilePath);
  } catch {
    await atomicWrite(profilePath, `${JSON.stringify(DEFAULT_PROFILE, null, 2)}\n`);
  }
}
