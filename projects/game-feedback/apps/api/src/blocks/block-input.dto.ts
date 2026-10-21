import { IsString, MinLength } from 'class-validator';
import type { z } from 'zod';

import { BlockInputSchema } from '@game-feedback/contracts';

export class BlockUserDto {
  static readonly contract = BlockInputSchema;
  @IsString()
  @MinLength(1)
  declare blockedUserId: z.output<typeof BlockInputSchema>['blockedUserId'];
}
