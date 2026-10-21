import { CommentInputSchema, CreateCommentInputSchema } from '@game-feedback/contracts';
import { Length, IsString, IsOptional } from 'class-validator';
import type { z } from 'zod';
import { Trim } from '../common/http/request-validation';

export class CommentBodyDto {
  static readonly contract = CommentInputSchema;
  @Trim()
  @IsString()
  @Length(1, 2000)
  declare body: z.output<typeof CommentInputSchema>['body'];
}

export class CreateCommentBodyDto extends CommentBodyDto {
  static readonly contract = CreateCommentInputSchema;
  @IsOptional()
  @IsString()
  declare parentId: z.output<typeof CreateCommentInputSchema>['parentId'];
}
