import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// src(테스트), dist(개발 서버), .e2e-build(E2E)에서 깊이가 달라도 같은 경로를 가리키도록 package.json을 찾는다.
function findApiRoot(start: string) {
  let directory = start;
  while (!existsSync(join(directory, 'package.json'))) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error('apps/api의 package.json을 찾을 수 없습니다.');
    directory = parent;
  }
  return directory;
}

/** apps/api */
export const API_ROOT = findApiRoot(__dirname);
/** projects/photo-contest */
export const PROJECT_ROOT = resolve(API_ROOT, '..', '..');
export const GRAPHQL_SCHEMA_GLOB = join(API_ROOT, 'src', '**', '*.graphql');
