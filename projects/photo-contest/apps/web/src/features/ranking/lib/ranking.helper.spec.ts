import { describe, expect, it } from 'vitest';

import { countByRank, getMedalTone, getRankLabel, getResultHeadline } from './ranking.helper';

describe('ranking.helper', () => {
  it('득표수 경쟁 순위 1·1·3을 공동 1위·공동 1위·3위로 보여 줘야 한다', () => {
    const results = [{ rank: 1 }, { rank: 1 }, { rank: 3 }, { rank: 4 }];
    const counts = countByRank(results);

    expect(results.map(({ rank }) => getRankLabel(rank, counts.get(rank) ?? 0))).toEqual([
      '공동 1위',
      '공동 1위',
      '3위',
      '4위',
    ]);
  });

  it('1~3위에만 순위대로 금·은·동 메달을 줘야 한다', () => {
    expect([1, 1, 3, 4].map(getMedalTone)).toEqual(['gold', 'gold', 'bronze', null]);
    expect(getMedalTone(2)).toBe('silver');
  });

  it('우승작 수에 따라 결과 배너 문구가 달라야 한다', () => {
    expect(getResultHeadline(0).title).toBe('이번 대회는 우승작 없이 마무리됐어요');
    expect(getResultHeadline(1).title).toBe('이번 대회 최고의 웃음!');
    expect(getResultHeadline(2).title).toBe('함께 웃겼다면, 함께 우승!');
    expect(getResultHeadline(5).description).toContain('공동 우승');
  });
});
