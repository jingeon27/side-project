import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// jsdom 환경의 URL은 node:fs가 받지 않으므로 경로 문자열로 바꾼다.
export const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
export const uiDir = join(srcDir, 'ui');

/** 테스트·스토리를 뺀 구현 파일. `extension`으로 TypeScript나 CSS를 고른다. */
export function sourceFiles(dir: string, extension = /\.tsx?$/): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path, extension);
    return extension.test(entry.name) && !/\.(spec|test|stories)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}
