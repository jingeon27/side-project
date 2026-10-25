import 'server-only';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** API가 먼저 만든 키만 읽는다. 값이나 경로를 브라우저 응답에 싣지 않는다. */
export function readRuntimeSecret() {
  try {
    const secret = readFileSync(resolve(process.cwd(), '../../.data/cache-revalidation.key'), 'utf8');
    return /^[a-f0-9]{64}$/.test(secret) ? secret : undefined;
  } catch {
    return undefined;
  }
}
