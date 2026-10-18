import { GameAccountInputSchema } from '@game-feedback/contracts';
import { IsString, Matches } from 'class-validator';
import type { z } from 'zod';
import { Trim } from '../common/http/request-validation';

export class GameAccountDto {
  static readonly contract = GameAccountInputSchema;
  @Trim()
  @IsString()
  @Matches(/^#?[0289PYLQGRJCUV]{3,15}$/i)
  declare playerTag: z.output<typeof GameAccountInputSchema>['playerTag'];
}
