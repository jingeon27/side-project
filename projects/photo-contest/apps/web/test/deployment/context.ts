import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataRoot = fileURLToPath(new URL('../../.data/', import.meta.url));

/** containers.sh가 만든 격리 Compose만 재시작할 수 있다. */
export function deploymentContext() {
  const value: unknown = JSON.parse(readFileSync(resolve(dataRoot, 'deployment-smoke.json'), 'utf8'));
  if (
    typeof value !== 'object' ||
    value === null ||
    !('directory' in value) ||
    !('project' in value) ||
    typeof value.directory !== 'string' ||
    typeof value.project !== 'string' ||
    !/^pc-smoke-[a-zA-Z0-9-]+$/.test(value.project) ||
    !resolve(value.directory).startsWith(resolve(dataRoot, 'containers-')) ||
    !/^containers-[a-zA-Z0-9]+$/.test(value.directory.split('/').at(-1) ?? '')
  )
    throw new Error('격리 Compose 정보가 필요합니다.');
  return { directory: resolve(value.directory), project: value.project };
}
