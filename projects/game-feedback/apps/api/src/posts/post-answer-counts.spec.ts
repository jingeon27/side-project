import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../generated/prisma';
import { answerCounts } from './post-answer-counts';

function fakeDb(groups: Array<{ postId: string; helpful: boolean; _count: { _all: number } }>) {
  return { answer: { groupBy: vi.fn(async () => groups) } };
}

describe('answerCounts', () => {
  it('sums visible answers and helpful answers per post from one grouped query', async () => {
    const db = fakeDb([
      { postId: 'a', helpful: false, _count: { _all: 3 } },
      { postId: 'a', helpful: true, _count: { _all: 2 } },
      { postId: 'b', helpful: false, _count: { _all: 1 } },
    ]);
    const counts = await answerCounts(
      db as unknown as Pick<Prisma.TransactionClient, 'answer'>,
      ['a', 'b', 'c'],
      ['blocked'],
    );
    expect(counts.get('a')).toEqual({ answerCount: 5, helpfulCount: 2 });
    expect(counts.get('b')).toEqual({ answerCount: 1, helpfulCount: 0 });
    expect(counts.get('c')).toBeUndefined();
    expect(db.answer.groupBy).toHaveBeenCalledWith({
      by: ['postId', 'helpful'],
      where: {
        postId: { in: ['a', 'b', 'c'] },
        hidden: false,
        deletedAt: null,
        authorId: { notIn: ['blocked'] },
      },
      _count: { _all: true },
    });
  });

  it('does not query for an empty page', async () => {
    const db = fakeDb([]);
    await expect(
      answerCounts(db as unknown as Pick<Prisma.TransactionClient, 'answer'>, [], []),
    ).resolves.toEqual(new Map());
    expect(db.answer.groupBy).not.toHaveBeenCalled();
  });
});
