import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/** 운영 도구를 실행하지 않고 빌드 산출물의 import 경로만 확인한다. */
export function checkBuiltImports(scriptsDirectory: string) {
  for (const entry of readdirSync(scriptsDirectory).filter(
    (name) => name.endsWith('.ts') && !/\.(spec|test)\.ts$/.test(name),
  )) {
    const file = join(scriptsDirectory, entry);
    const require = createRequire(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\brequire\(\s*(['"])(\.\.\/dist\/[^'"]+)\1\s*\)/g)) {
      const target = match[2];
      if (target) require.resolve(target);
    }
  }
}
