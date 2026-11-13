import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../../../../../', import.meta.url));
const script = join(repo, 'deploy/shared-instance/scripts/ci-superseded.sh');
const policy = join(repo, 'deploy/shared-instance/scripts/service-ci.ts');
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

/** Services의 selection과 같은 명령으로 base 이후 변경에서 서비스 검사를 하나라도 고르는지 본다. */
function selectsServices(base: string) {
  const event = join(state.directory, '.event.json');
  const output = join(state.directory, '.output');
  writeFileSync(event, JSON.stringify({ before: base }));
  writeFileSync(output, '');
  const result = spawnSync(process.execPath, [policy, 'select'], {
    cwd: state.directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: 'refs/heads/develop',
      GITHUB_EVENT_PATH: event,
      GITHUB_OUTPUT: output,
    },
  });
  expect(result.status, result.stderr).toBe(0);
  return /^(?:game-feedback|photo-contest)=true$/m.test(readFileSync(output, 'utf8'));
}

beforeEach(() => {
  state.directory = mkdtempSync(join(tmpdir(), 'ci-superseded-'));
  git('init', '-q', '-b', 'main');
  commit('README.md');
});
afterEach(() => rmSync(state.directory, { recursive: true, force: true }));

describe('최신 커밋 배포 판정', () => {
  // Services는 경로 필터 없이 실행하므로 검사 선택과 배포 생략 판정이 같은 서비스 경로를 써야 한다.
  it.each(['photo-contest', 'game-feedback'])(
    '%s 배포 판정은 검사 선택과 같은 경로를 써야 한다',
    (service) => {
      const listed = execFileSync('bash', [script, service, '--paths'], { encoding: 'utf8' })
        .trim()
        .split('\n');
      expect(listed).toContain(`projects/${service}/**`);
      expect(listed).toEqual(
        execFileSync(process.execPath, [policy, 'paths', service], { encoding: 'utf8' }).trim().split('\n'),
      );
    },
  );

  it.each([
    [['projects/blog/apps/web/content/post.mdx', 'projects/blog/apps/web/seo/ko.json'], false],
    [['projects/blog/apps/web/src/app/page.tsx', 'projects/blog/apps/web/next.config.ts'], false],
    [['projects/blog/apps/web/public/images/post.png', '.github/workflows/blog.yml'], false],
    [['projects/blog/README.md', 'README.md'], false],
    [['projects/blog/README.md', 'projects/game-feedback/apps/web/src/app/page.tsx'], true],
    [['projects/blog/README.md', 'projects/photo-contest/apps/api/src/main.ts'], true],
    [['projects/blog/README.md', 'packages/design-system/.storybook/main.ts'], true],
    [['projects/blog/README.md', 'deploy/shared-instance/Caddyfile'], true],
    [['projects/blog/README.md', 'yarn.lock'], true],
    [['projects/game-feedback/.env.example'], true],
  ] as const)('%j 변경 시 Services가 서비스 검사를 고르는지는 %s여야 한다', (files, expected) => {
    const base = git('rev-parse', 'HEAD');
    for (const file of files) commit(file);
    expect(selectsServices(base)).toBe(expected);
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
    ['다른 서비스 빌드 설정', 'projects/game-feedback/apps/web/next.config.ts'],
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
    commit('projects/game-feedback/apps/web/next.config.ts');
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
