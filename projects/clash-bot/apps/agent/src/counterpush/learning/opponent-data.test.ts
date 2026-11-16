import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import sharp from 'sharp';
import { expect, it } from 'vitest';

import { prepareOpponentDataset } from './opponent-data.ts';

// 폴더 이동 때 '..' 검사가 '../../..'로 바뀌어, 다른 경기나 평가 경기의 프레임이 상대 모방 자료에 들어올 수 있었다.
it.each(['../other-run/frames/000001.png', '../../evaluations/run/frames/000001.png'])(
  'refuses a frame outside the observation folder: %s',
  async (outside) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'clash-opponent-outside-'));
    try {
      const run = join(dataDir, 'counterpush/runs/current');
      const image = await sharp({ create: { width: 368, height: 652, channels: 3, background: '#315a43' } })
        .png()
        .toBuffer();
      await Promise.all(
        [join(run, outside), join(run, 'after.png')].map(async (path) => {
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, image);
        }),
      );
      await writeFile(
        join(run, 'observations.json'),
        JSON.stringify({
          version: 1,
          source: 'counterpush_live_screen',
          actor: 'red_top',
          deck: [
            'furnace',
            'ice_wizard',
            'knight',
            'graveyard',
            'skeletons',
            'poison',
            'goblin_hut',
            'barbarian_barrel',
          ],
          crop: { x: 0, y: 0, width: 368, height: 652 },
          observations: [
            {
              id: 'furnace-left',
              before: { image: outside, secondsRemaining: 165 },
              after: { image: 'after.png', secondsRemaining: 161 },
              card: 'furnace',
              lane: 'left',
              confidence: 0.95,
              evidence: 'new_unit_visible',
              verifiedActor: true,
              absentBefore: true,
              context: 'Opponent adds a furnace in the left lane.',
            },
          ],
        }),
      );
      await expect(prepareOpponentDataset(join(run, 'observations.json'), dataDir)).rejects.toThrow(
        '관찰 폴더 밖의 이미지는 허용하지 않습니다.',
      );
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  },
);
