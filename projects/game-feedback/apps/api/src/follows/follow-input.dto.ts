import { IsBoolean } from 'class-validator';
import type { z } from 'zod';

import { FollowInputSchema } from '@game-feedback/contracts';

export class FollowUserDto {
  static readonly contract = FollowInputSchema;
  @IsBoolean()
  declare notifyNewPosts: z.output<typeof FollowInputSchema>['notifyNewPosts'];
}
