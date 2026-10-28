import { describe, expect, it } from 'vitest';

import { BoardKindSchema } from '@game-feedback/contracts';

import { boardByKind, gameBoards } from './boards';

describe('game boards', () => {
  it('lists every contract board kind exactly once', () => {
    for (const kind of BoardKindSchema.options) {
      expect(gameBoards.filter((board) => board.kind === kind)).toHaveLength(1);
      expect(boardByKind(kind)?.kind).toBe(kind);
    }
    expect(gameBoards).toHaveLength(BoardKindSchema.options.length);
  });

  it('gives each board its own slug', () => {
    const slugs = gameBoards.map((board) => board.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
