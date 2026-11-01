import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../../../../../', import.meta.url));
const script = join(repo, 'deploy/shared-instance/scripts/ci-superseded.sh');
const state = {} as { directory: string };

const git = (...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=CI', '-c', 'user.email=ci@example.test', '-c', 'commit.gpgsign=false', ...args],
    { cwd: state.directory, encoding: 'utf8' },
  ).trim();

function commit(file: string) {
  const path = join(state.directory, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${Math.random()}\n`);
  git('add', '-A');
  git('commit', '-q', '-m', file);
  return git('rev-parse', 'HEAD');
}

function decide(service: string, release: string) {
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const output = join(state.directory, '.output');
  const summary = join(state.directory, '.summary');
  writeFileSync(output, '');
  writeFileSync(summary, '');
  const result = spawnSync('bash', [script, service, 'main'], {
    cwd: state.directory,
    encoding: 'utf8',
    env: { ...process.env, RELEASE_SHA: release, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
  });
  expect(result.status, result.stderr).toBe(0);
  return { output: readFileSync(output, 'utf8').trim(), summary: readFileSync(summary, 'utf8') };
}

/** 워크플로의 on.push.paths 목록을 읽는다. 목록은 블록 형식으로 쓴다. */
function workflowPaths() {
  const lines = readFileSync(join(repo, '.github/workflows/services.yml'), 'utf8').split('\n');
  const start = lines.indexOf('  push:');
  const list = lines.indexOf('    paths:', start);
  const paths: string[] = [];
  for (const line of lines.slice(list + 1)) {
    const match = /^ {6}- '?([^']+?)'?$/.exec(line);
    if (!match?.[1]) break;
    paths.push(match[1]);
  }
  return paths;
}

beforeEach(() => {
  state.directory = mkdtempSync(join(tmpdir(), 'ci-superseded-'));
  git('init', '-q', '-b', 'main');
  commit('README.md');
});
afterEach(() => rmSync(state.directory, { recursive: true, force: true }));

describe('최신 커밋 배포 판정', () => {
  it('중앙 워크플로는 두 서비스 배포 판정의 경로를 모두 검사해야 한다', () => {
    const listed = ['photo-contest', 'game-feedback'].flatMap((service) =>
      execFileSync('bash', [script, service, '--paths'], { encoding: 'utf8' }).trim().split('\n'),
    );
    expect(new Set(workflowPaths())).toEqual(new Set(listed));
    // PR에서는 경로와 무관하게 최종 판정까지 도달해야 required check가 대기하지 않는다.
    expect(readFileSync(join(repo, '.github/workflows/services.yml'), 'utf8')).toMatch(
      /^  pull_request: null$/m,
    );
  });

  it('브랜치 끝의 커밋은 배포해야 한다', () => {
    const release = commit('projects/photo-contest/apps/api/src/main.ts');
    expect(decide('photo-contest', release)).toEqual({ output: 'deploy=true', summary: '' });
  });

  it.each([
    ['다른 서비스', 'projects/game-feedback/apps/api/src/main.ts'],
    ['블로그', 'projects/blog/apps/web/content/post.mdx'],
    ['루트 문서', 'README.md'],
    ['루트가 아닌 package.json', 'projects/blog/package.json'],
    ['다른 서비스 워크플로', '.github/workflows/game-feedback.yml'],
  ])('뒤에 %s만 바뀌었으면 검증한 릴리스를 그대로 배포해야 한다', (_, file) => {
    const release = commit('projects/photo-contest/apps/web/src/app/page.tsx');
    commit(file);
    expect(decide('photo-contest', release).output).toBe('deploy=true');
  });

  it.each([
    ['서비스 코드', 'projects/photo-contest/apps/web/src/app/page.tsx'],
    ['공유 패키지', 'packages/design-system/src/index.ts'],
    ['공통 배포 설정', 'deploy/shared-instance/Caddyfile'],
    ['lockfile', 'yarn.lock'],
    ['중앙 검사 워크플로', '.github/workflows/services.yml'],
  ])('뒤에 %s를 바꾼 커밋이 있으면 생략하고 요약을 남겨야 한다', (_, file) => {
    const release = commit('projects/photo-contest/apps/api/src/main.ts');
    const newer = commit(file);
    commit('README.md');
    const result = decide('photo-contest', release);
    expect(result.output).toBe('deploy=false');
    expect(result.summary).toContain('photo-contest deployment skipped');
    expect(result.summary).toContain(newer);
  });

  it('서비스마다 자기 경로만 본다', () => {
    const release = commit('packages/config/eslint/src/base.ts');
    commit('.github/workflows/game-feedback.yml');
    expect(decide('photo-contest', release).output).toBe('deploy=true');
    expect(decide('game-feedback', release).output).toBe('deploy=false');
  });

  it('브랜치에서 사라진 커밋은 배포하지 않아야 한다', () => {
    const base = git('rev-parse', 'HEAD');
    const release = commit('projects/photo-contest/apps/api/src/main.ts');
    git('reset', '-q', '--hard', base);
    commit('docs.md');
    const result = decide('photo-contest', release);
    expect(result.output).toBe('deploy=false');
    expect(result.summary).toContain('no longer on main');
  });
});
