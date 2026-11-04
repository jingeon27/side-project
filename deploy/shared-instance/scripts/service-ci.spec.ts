import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { failedChecks, isProductionRun, requiredChecks, selectServices } from './service-ci';

describe('service CI selection and release gate', () => {
  it.each([
    ['push', 'refs/heads/main', true],
    ['workflow_dispatch', 'refs/heads/main', true],
    ['push', 'refs/heads/develop', false],
    ['workflow_dispatch', 'refs/heads/develop', false],
    ['workflow_dispatch', 'refs/heads/feat/example', false],
    ['pull_request', 'refs/heads/main', false],
    ['pull_request', 'refs/pull/1/merge', false],
    ['push', 'refs/tags/main', false],
    ['schedule', 'refs/heads/main', false],
    [undefined, undefined, false],
  ])('%s · %s에서 운영 배포 허용 여부는 %s여야 한다', (eventName, ref, expected) => {
    expect(isProductionRun({ eventName, ref })).toBe(expected);
  });

  it.each([
    ['push', 'refs/heads/main', 'true'],
    ['push', 'refs/heads/develop', 'false'],
    ['pull_request', 'refs/heads/main', 'false'],
  ])('선택 CLI가 %s · %s의 운영 판정을 workflow output으로 전달해야 한다', (eventName, ref, production) => {
    const directory = mkdtempSync(join(tmpdir(), 'service-ci-'));
    const event = join(directory, 'event.json');
    const output = join(directory, 'output');
    writeFileSync(event, '{}');
    try {
      const result = spawnSync(
        process.execPath,
        [new URL('./service-ci.ts', import.meta.url).pathname, 'select'],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            GITHUB_EVENT_NAME: eventName,
            GITHUB_REF: ref,
            GITHUB_EVENT_PATH: event,
            GITHUB_OUTPUT: output,
          },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(output, 'utf8')).toContain(`production=${production}\n`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ['projects/game-feedback/apps/web/src/page.tsx', true, false],
    ['projects/photo-contest/apps/api/src/post.ts', false, true],
    ['packages/design-system/src/button.tsx', true, true],
    ['deploy/shared-instance/scripts/service.sh', true, true],
    ['.github/workflows/services.yml', true, true],
    ['yarn.lock', true, true],
    ['projects/blog/package.json', false, false],
    ['README.md', false, false],
  ])('%s selects only affected services', (file, gameFeedback, photoContest) => {
    expect(selectServices({ files: [file] })).toEqual({ gameFeedback, photoContest });
  });

  it('a move between projects selects both the deleted and added paths', () => {
    expect(
      selectServices({ files: ['projects/game-feedback/old.ts', 'projects/photo-contest/new.ts'] }),
    ).toEqual({ gameFeedback: true, photoContest: true });
  });

  it('an unknown base or manual run selects both services', () => {
    expect(selectServices({ files: [], forceAll: true })).toEqual({ gameFeedback: true, photoContest: true });
  });

  it('a selected failure, cancellation, skip or missing result blocks publication', () => {
    const selection = { gameFeedback: true, photoContest: true };
    const success = Object.fromEntries(requiredChecks(selection).map((name) => [name, 'success']));
    expect(failedChecks({ selection, results: success })).toEqual([]);
    for (const result of ['failure', 'cancelled', 'skipped', 'undefined']) {
      expect(failedChecks({ selection, results: { ...success, 'pc-containers': result } })).toEqual([
        'pc-containers',
      ]);
    }
    expect(failedChecks({ selection, results: {} })).toContain('selection');
  });

  it('unaffected service checks may be skipped but shared image verification is required', () => {
    const selection = { gameFeedback: true, photoContest: false };
    const results = Object.fromEntries(requiredChecks(selection).map((name) => [name, 'success']));
    expect(failedChecks({ selection, results: { ...results, 'pc-verify': 'skipped' } })).toEqual([]);
    expect(failedChecks({ selection, results: { ...results, 'shared-contract': 'skipped' } })).toEqual([
      'shared-contract',
    ]);
  });
  it('선택 결과가 없으면 빈 검사 목록을 성공으로 처리하지 않아야 한다', () => {
    const result = spawnSync(
      process.execPath,
      [new URL('./service-ci.ts', import.meta.url).pathname, 'verify'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CI_NEEDS: JSON.stringify({ selection: { result: 'success', outputs: {} } }),
          GITHUB_STEP_SUMMARY: '',
        },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('selection');
  });
});
