import { describe, expect, it } from 'vitest';

import { rankResults } from './result-ranking';

function photo(id: string, voteCount: number, likeCount = 0, createdAt = '2026-10-13T00:00:00Z') {
  return { id, voteCount, likeCount, createdAt: new Date(createdAt) };
}

function summary(items: ReturnType<typeof photo>[]) {
  return rankResults(items).map(({ item, rank, winner }) => [item.id, rank, winner]);
}

describe('대회 결과 순위', () => {
  it('득표수 경쟁 순위를 매기고 최다 득표를 모두 우승으로 표시해야 한다', () => {
    expect(summary([photo('c', 1), photo('a', 3), photo('b', 3), photo('d', 0)])).toEqual([
      ['a', 1, true],
      ['b', 1, true],
      ['c', 3, false],
      ['d', 4, false],
    ]);
  });

  it('표가 하나도 없으면 모두 1위지만 우승자는 없어야 한다', () => {
    expect(summary([photo('a', 0), photo('b', 0)])).toEqual([
      ['a', 1, false],
      ['b', 1, false],
    ]);
  });

  it('같은 순위 안에서는 좋아요 많은 순, 먼저 낸 순으로 정렬해야 한다', () => {
    expect(
      summary([
        photo('late', 2, 1, '2026-10-13T02:00:00Z'),
        photo('early', 2, 1, '2026-10-13T01:00:00Z'),
        photo('liked', 2, 5, '2026-10-13T03:00:00Z'),
      ]),
    ).toEqual([
      ['liked', 1, true],
      ['early', 1, true],
      ['late', 1, true],
    ]);
  });

  it('입력 배열을 바꾸지 않아야 한다', () => {
    const items = [photo('b', 1), photo('a', 2)];
    rankResults(items);
    expect(items.map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('사진이 없으면 빈 결과를 돌려줘야 한다', () => {
    expect(rankResults([])).toEqual([]);
  });
});
