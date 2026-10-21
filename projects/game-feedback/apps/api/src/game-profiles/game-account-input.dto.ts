import { IsString, Matches } from 'class-validator';
import type { z } from 'zod';

import { GameAccountInputSchema, PLAYER_TAG_PATTERN } from '@game-feedback/contracts';

import { Trim } from '../common/http/request-validation';

export class GameAccountDto {
  static readonly contract = GameAccountInputSchema;
  @Trim()
  @IsString()
  @Matches(PLAYER_TAG_PATTERN)
  declare playerTag: z.output<typeof GameAccountInputSchema>['playerTag'];
}
