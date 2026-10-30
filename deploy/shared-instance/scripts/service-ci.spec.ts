import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { failedChecks, requiredChecks, selectServices } from './service-ci';

describe('service CI selection and release gate', () => {
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
