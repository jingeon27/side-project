import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const scripts = fileURLToPath(new URL('.', import.meta.url));
const modules = fileURLToPath(new URL('../../../node_modules', import.meta.url));
const state = {} as { directory: string };

/** tasks.ts와 env.ts를 주어진 이름의 프로젝트 디렉터리로 복사한다. 의존성은 저장소 node_modules를 쓴다. */
function copyProject(name: string) {
  const project = join(state.directory, name);
  mkdirSync(join(project, 'scripts'), { recursive: true });
  writeFileSync(join(project, 'package.json'), '{ "type": "module" }\n');
  symlinkSync(modules, join(project, 'node_modules'));
  for (const file of ['tasks.ts', 'env.ts']) cpSync(join(scripts, file), join(project, 'scripts', file));
  return project;
}

// 알 수 없는 작업 이름은 runTask의 사용법 오류로 끝나므로, 작업이 실제로 호출됐는지 확인할 수 있다.
const runUnknownTask = (script: string) =>
  spawnSync(process.execPath, [script, 'unknown-task'], {
    encoding: 'utf8',
    env: { ...process.env, ENVIRONMENT: 'development' },
  });

beforeEach(() => {
  state.directory = mkdtempSync(join(tmpdir(), 'gf-tasks-'));
});
afterEach(() => rmSync(state.directory, { recursive: true, force: true }));

describe('GF 작업 진입점', () => {
  it.each(['game-feedback', 'game feedback', '게임피드백'])(
    '%s 경로에서 직접 실행하면 작업을 건너뛰지 않아야 한다',
    (name) => {
      const result = runUnknownTask(join(copyProject(name), 'scripts/tasks.ts'));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Usage: tasks.ts');
    },
  );

  it('심볼릭 링크 경로로 실행해도 작업을 건너뛰지 않아야 한다', () => {
    const link = join(state.directory, 'linked checkout');
    symlinkSync(copyProject('game-feedback'), link);
    const result = runUnknownTask(join(link, 'scripts/tasks.ts'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: tasks.ts');
  });

  it('다른 스크립트가 불러올 때는 작업을 실행하지 않아야 한다', () => {
    const project = copyProject('game feedback');
    writeFileSync(join(project, 'scripts/entry.ts'), "await import('./tasks.ts');\n");
    const result = runUnknownTask(join(project, 'scripts/entry.ts'));
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).not.toContain('Usage: tasks.ts');
  });
});
