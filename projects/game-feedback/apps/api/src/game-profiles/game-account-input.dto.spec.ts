import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { PlayerTagSchema } from '@game-feedback/contracts';

import { RequestValidationPipe } from '../common/http/request-validation';
import { GameAccountDto } from './game-account-input.dto';

describe('eight-character player tags', () => {
  it.each([
    ['#GG829JGY', '#GG829JGY'],
    [' ab12cd34 ', '#AB12CD34'],
    ['#ab12cd34', '#AB12CD34'],
  ])('normalizes %s consistently for lookup and registration', async (input, expected) => {
    expect(PlayerTagSchema.parse(input)).toBe(expected);
    await expect(
      new RequestValidationPipe(GameAccountDto).transform({ playerTag: input }, { type: 'body' }),
    ).resolves.toEqual({ playerTag: expected });
  });
});
