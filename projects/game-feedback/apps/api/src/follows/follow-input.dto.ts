import { FollowInputSchema } from '@game-feedback/contracts';
import { IsBoolean } from 'class-validator';
import type { z } from 'zod';

export class FollowUserDto {
  static readonly contract = FollowInputSchema;
  @IsBoolean()
  declare notifyNewPosts: z.output<typeof FollowInputSchema>['notifyNewPosts'];
}
