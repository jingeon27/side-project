import { IsString, Length } from 'class-validator';
import type { z } from 'zod';

import { CommentInputSchema } from '@game-feedback/contracts';

import { Trim } from '../common/http/request-validation';

export class CommentBodyDto {
  static readonly contract = CommentInputSchema;
  @Trim()
  @IsString()
  @Length(1, 2000)
  declare body: z.output<typeof CommentInputSchema>['body'];
}
