import { afterEach, describe, expect, it, vi } from 'vitest';

import { GameProfileSchema } from '@game-feedback/contracts';

import { SupercellProfileProvider } from './supercell-profile.provider';

const player = {
  tag: '#QLLLPR89G',
  name: '플레이어',
  trophies: 11102,
  bestTrophies: 12000,
  arena: { name: 'Musketeer Street' },
};

afterEach(() => vi.unstubAllGlobals());

describe('Supercell 시즌 순위', () => {
  it('현재 시즌과 최고 시즌의 세계 순위를 구분해서 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...player,
          currentPathOfLegendSeasonResult: { rank: 1234 },
          bestPathOfLegendSeasonResult: { rank: 358 },
        }),
      ),
    );
    const profile = GameProfileSchema.parse(
      await new SupercellProfileProvider('test-token').lookup(player.tag),
    );
    expect(profile).toMatchObject({ currentGlobalRank: 1234, bestGlobalRank: 358 });
  });

  it('현재 순위가 없으면 이전 또는 최고 시즌의 순위를 현재 순위로 대신 표시하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...player,
          currentPathOfLegendSeasonResult: { rank: null },
          lastPathOfLegendSeasonResult: { rank: 900 },
          bestPathOfLegendSeasonResult: { rank: 358 },
          leagueStatistics: { currentSeason: { rank: 12 } },
        }),
      ),
    );
    expect(await new SupercellProfileProvider('test-token').lookup(player.tag)).toMatchObject({
      currentGlobalRank: null,
      bestGlobalRank: 358,
    });
  });

  it.each([undefined, null, { rank: null }, { rank: 0 }, { rank: -1 }, { rank: 1.5 }])(
    '순위가 없거나 유효하지 않으면 null로 반환한다 (%j)',
    async (result) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          Response.json({
            ...player,
            currentPathOfLegendSeasonResult: result,
            bestPathOfLegendSeasonResult: result,
          }),
        ),
      );
      const profile = GameProfileSchema.parse(
        await new SupercellProfileProvider('test-token').lookup(player.tag),
      );
      expect(profile.currentGlobalRank).toBeNull();
      expect(profile.bestGlobalRank).toBeNull();
    },
  );
});
