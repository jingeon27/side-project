import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const contentPaths = [
  /^projects\/blog\/apps\/web\/content\/.*\.(?:mdx|json)$/,
  /^projects\/blog\/apps\/web\/seo\/[^/]+\.json$/,
  /^projects\/blog\/apps\/web\/public\/images\/.*\.(?:png|jpe?g|webp|gif|avif|svg)$/i,
  /^projects\/blog\/docs\/.*\.(?:md|json)$/,
  /^projects\/blog\/(?:README|AGENTS)\.md$/,
];
const generatedPaths = new Set([
  'projects/blog/apps/web/src/shared/article/lib/index.json',
  'projects/blog/apps/web/src/shared/article/lib/registry.ts',
  'projects/blog/apps/web/src/shared/config/image-sizes.json',
]);

export function isBlogContentOnly(files: readonly string[]) {
  return (
    files.length > 0 &&
    files.every((file) => generatedPaths.has(file) || contentPaths.some((pattern) => pattern.test(file)))
  );
}

function main() {
  const base = process.env.CI_BASE_SHA;
  // Missing history selects full verification. --no-renames includes both sides of moves.
  const files =
    base && /^[a-f0-9]{40}$/.test(base) && !/^0+$/.test(base)
      ? execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', base, 'HEAD'], {
          encoding: 'utf8',
        })
          .split('\0')
          .filter(Boolean)
      : [];
  const contentOnly = isBlogContentOnly(files);
  appendFileSync(process.env.GITHUB_OUTPUT ?? '', `content-only=${contentOnly}\n`);
  console.log(contentOnly ? 'Blog content: validate and format.' : 'Full code verification required.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
