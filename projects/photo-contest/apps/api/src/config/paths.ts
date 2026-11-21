import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// src(테스트), dist(개발 서버), .e2e-build(E2E)에서 깊이가 달라도 같은 경로를 가리키도록 package.json을 찾는다.
function findApiRoot(directory: string): string {
  if (existsSync(join(directory, 'package.json'))) return directory;
  const parent = dirname(directory);
  if (parent === directory) throw new Error('apps/api의 package.json을 찾을 수 없습니다.');
  return findApiRoot(parent);
}

/** apps/api */
export const API_ROOT = findApiRoot(__dirname);
export const GRAPHQL_SCHEMA_GLOB = join(API_ROOT, 'src', '**', '*.graphql');
