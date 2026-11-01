import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const policy = fileURLToPath(new URL('./service-ci.ts', import.meta.url));
const superseded = fileURLToPath(new URL('./ci-superseded.sh', import.meta.url));
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
  writeFileSync(path, 'review fixture\n');
  git('add', '--', file);
  git('commit', '-q', '-m', file);
  return git('rev-parse', 'HEAD');
}

function run(binary: string, args: string[], release: string) {
  const output = join(state.directory, '.output');
  writeFileSync(output, '');
  const result = spawnSync(binary, args, {
    cwd: state.directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: 'push',
      GITHUB_EVENT_PATH: join(state.directory, '.event.json'),
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: join(state.directory, '.summary'),
      RELEASE_SHA: release,
    },
  });
  expect(result.status, result.stderr).toBe(0);
  return readFileSync(output, 'utf8').trim();
}

beforeEach(() => {
  state.directory = mkdtempSync(join(tmpdir(), 'service-ci-hidden-path-'));
  git('init', '-q', '-b', 'main');
});
afterEach(() => rmSync(state.directory, { recursive: true, force: true }));

describe('숨김 경로의 검사 선택과 배포 생략', () => {
  it.each([
    ['projects/game-feedback/.env.example', 'game-feedback', true, false],
    ['projects/game-feedback/apps/web/.npmrc', 'game-feedback', true, false],
    ['projects/photo-contest/.env.example', 'photo-contest', false, true],
    ['packages/design-system/.storybook/main.ts', 'game-feedback', true, true],
    ['projects/game-feedback-copy/.env.example', 'game-feedback', false, false],
    ['packages-old/.storybook/main.ts', 'game-feedback', false, false],
  ] as const)(
    '%s 변경으로 검증한 배포가 누락되지 않아야 한다',
    (file, service, gameFeedback, photoContest) => {
      const release = commit(`projects/${service}/apps/api/src/main.ts`);
      const latest = commit(file);
      git('update-ref', 'refs/remotes/origin/main', latest);
      writeFileSync(join(state.directory, '.event.json'), JSON.stringify({ before: release }));

      expect(run(process.execPath, [policy, 'select'], release)).toBe(
        `game-feedback=${gameFeedback}\nphoto-contest=${photoContest}`,
      );
      const selected = service === 'game-feedback' ? gameFeedback : photoContest;
      expect(run('bash', [superseded, service, 'main'], release)).toBe(`deploy=${!selected}`);
      if (selected) expect(run('bash', [superseded, service, 'main'], latest)).toBe('deploy=true');
    },
  );
});
