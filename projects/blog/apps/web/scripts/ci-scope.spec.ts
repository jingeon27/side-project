// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { isBlogContentOnly } from './ci-scope';

const script = fileURLToPath(new URL('./ci-scope.ts', import.meta.url));
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function repository() {
  const cwd = mkdtempSync(join(tmpdir(), 'blog-ci-scope-'));
  directories.push(cwd);
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '-q');
  git('config', 'user.name', 'CI test');
  git('config', 'user.email', 'ci-test@example.invalid');
  return { cwd, git };
}

function select(cwd: string, base: string) {
  const output = join(cwd, 'github-output');
  const result = spawnSync(process.execPath, [script], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CI_BASE_SHA: base, GITHUB_OUTPUT: output },
  });
  return { ...result, output: result.status === 0 ? readFileSync(output, 'utf8') : '' };
}

describe('blog CI scope', () => {
  it('keeps a complete translated article and its images, SEO and generated files on the content lane', () => {
    expect(
      isBlogContentOnly([
        'projects/blog/apps/web/content/posts/example/ko.mdx',
        'projects/blog/apps/web/content/posts/example/en.mdx',
        'projects/blog/apps/web/content/posts/example/meta.json',
        'projects/blog/apps/web/content/generated-redirects.json',
        'projects/blog/apps/web/seo/ko.json',
        'projects/blog/apps/web/public/images/covers/example.png',
        'projects/blog/apps/web/src/shared/article/lib/index.json',
        'projects/blog/apps/web/src/shared/article/lib/registry.ts',
        'projects/blog/apps/web/src/shared/config/image-sizes.json',
        'projects/blog/docs/image-prompts.json',
      ]),
    ).toBe(true);
  });

  it.each([
    'projects/blog/apps/web/src/app/page.tsx',
    'projects/blog/apps/web/src/shared/ui/brand-mark.tsx',
    'projects/blog/apps/web/scripts/content.ts',
    'projects/blog/apps/web/content/example.ts',
    'projects/blog/apps/web/package.json',
    'projects/blog/apps/web/next.config.ts',
    'projects/blog/apps/web/public/script.js',
    'projects/game-feedback/apps/api/src/main.ts',
    'packages/config/eslint/src/base.ts',
    'yarn.lock',
    '.github/workflows/blog.yml',
    '.prettierignore',
  ])('requires full verification when article changes include %s', (file) => {
    expect(isBlogContentOnly(['projects/blog/apps/web/content/posts/example/ko.mdx', file])).toBe(false);
  });

  it('defaults to full verification when no changed paths are available', () => {
    expect(isBlogContentOnly([])).toBe(false);
  });

  it('outputs content-only for an actual article diff', () => {
    const { cwd, git } = repository();
    const article = join(cwd, 'projects/blog/apps/web/content/posts/example/ko.mdx');
    mkdirSync(dirname(article), { recursive: true });
    writeFileSync(article, 'Original article');
    git('add', '.');
    git('commit', '-qm', 'Initial content');
    const base = git('rev-parse', 'HEAD');
    writeFileSync(article, 'Updated article');
    git('commit', '-qam', 'Revise article');
    expect(select(cwd, base)).toMatchObject({ status: 0, output: 'content-only=true\n' });
  });

  it('keeps full verification when application code is moved into the content directory', () => {
    const { cwd, git } = repository();
    const route = join(cwd, 'projects/blog/apps/web/src/app/page.tsx');
    const article = join(cwd, 'projects/blog/apps/web/content/posts/example/ko.mdx');
    mkdirSync(dirname(route), { recursive: true });
    writeFileSync(route, 'Same file contents before and after a move');
    git('add', '.');
    git('commit', '-qm', 'Initial route');
    const base = git('rev-parse', 'HEAD');
    mkdirSync(dirname(article), { recursive: true });
    renameSync(route, article);
    git('add', '-A');
    git('commit', '-qm', 'Move route into content');
    expect(select(cwd, base)).toMatchObject({ status: 0, output: 'content-only=false\n' });
  });

  it('does not select the light lane for a missing or unknown base commit', () => {
    const { cwd, git } = repository();
    writeFileSync(join(cwd, 'README.md'), 'Test repository');
    git('add', '.');
    git('commit', '-qm', 'Initial commit');
    expect(select(cwd, '0'.repeat(40))).toMatchObject({ status: 0, output: 'content-only=false\n' });
    expect(select(cwd, '1'.repeat(40)).status).not.toBe(0);
  });
});
