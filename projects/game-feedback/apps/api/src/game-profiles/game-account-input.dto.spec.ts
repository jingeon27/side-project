import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { PlayerTagSchema } from '@game-feedback/contracts';

import { RequestValidationPipe } from '../common/http/request-validation';
import { GameAccountDto } from './game-account-input.dto';

describe('player tags with variable lengths', () => {
  it.each([
    ['#GG829JGY', '#GG829JGY'],
    [' ab12cd34 ', '#AB12CD34'],
    ['#ab12cd34', '#AB12CD34'],
    ['#ABC123', '#ABC123'],
    ['#P0LYQ829G', '#P0LYQ829G'],
    [' p0lyq829g ', '#P0LYQ829G'],
  ])('normalizes %s consistently for lookup and registration', async (input, expected) => {
    expect(PlayerTagSchema.parse(input)).toBe(expected);
    await expect(
      new RequestValidationPipe(GameAccountDto).transform({ playerTag: input }, { type: 'body' }),
    ).resolves.toEqual({ playerTag: expected });
  });

  it.each(['#', '#AB12_CD4', '#AB12 CD4', '##AB12CD34', '#AAAAAAAAAAAAAAAA'])(
    'rejects malformed or oversized tag %s',
    async (input) => {
      expect(PlayerTagSchema.safeParse(input).success).toBe(false);
      await expect(
        new RequestValidationPipe(GameAccountDto).transform({ playerTag: input }, { type: 'body' }),
      ).rejects.toThrow();
    },
  );
});
