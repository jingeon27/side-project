import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { DEFAULT_PROFILE } from '../../shared/config.ts';
import type { CounterpushVisionClient } from '../perception/vision-client.ts';
import { reprocessEpisode } from './reprocess.ts';

// 폴더 이동 때 '..' 검사가 '../..'로 바뀌어, counterpush/runs의 형제 폴더도 다시 인식 대상으로 통과했다.
it.each(['counterpush/evaluations/run', 'counterpush/runs-old/run', 'counterpush/runs'])(
  'refuses a directory that is not a recorded run under counterpush/runs: %s',
  async (directory) => {
    const dataDir = join(tmpdir(), 'clash-reprocess-outside');
    await expect(
      reprocessEpisode({} as CounterpushVisionClient, dataDir, join(dataDir, directory), DEFAULT_PROFILE),
    ).rejects.toThrow('Counterpush 경기 기록 폴더가 필요합니다.');
  },
);
