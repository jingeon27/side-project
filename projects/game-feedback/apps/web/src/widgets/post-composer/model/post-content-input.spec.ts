import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import type { TBoardKind } from '@game-feedback/contracts';

import type { postComposerSchema } from './post-composer.schema';
import { postContentInput } from './post-content-input';

function values(board: TBoardKind | undefined): z.output<typeof postComposerSchema> {
  return {
    title: '덱 운영 질문',
    body: '본문',
    board,
    document: null,
    coaching: { role: 'COACH', pricing: { type: 'HOURLY', amount: 30000 } },
    friendSale: { price: 15000 },
    battle: { mode: 'TEAM' },
    categoryId: 'category-1',
    editorValid: true,
  };
}

describe('post content input', () => {
  it('sends only the details of the selected board', () => {
    expect(postContentInput(values('COACHING'))).toEqual({
      title: '덱 운영 질문',
      body: '본문',
      document: null,
      coaching: { role: 'COACH', pricing: { type: 'HOURLY', amount: 30000 } },
    });
    expect(postContentInput(values('FRIEND_SALE'))).toEqual({
      title: '덱 운영 질문',
      body: '본문',
      document: null,
      friendSale: { price: 15000 },
    });
    expect(postContentInput(values('FRIENDLY'))).toEqual({
      title: '덱 운영 질문',
      body: '본문',
      document: null,
      battle: { mode: 'TEAM' },
    });
    for (const board of ['FEEDBACK', 'FREE', undefined] as const)
      expect(postContentInput(values(board))).toEqual({
        title: '덱 운영 질문',
        body: '본문',
        document: null,
      });
  });
});
