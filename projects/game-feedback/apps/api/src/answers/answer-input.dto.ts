import { AnswerInputSchema, HelpfulInputSchema } from '@game-feedback/contracts';
import { Length, IsBoolean, IsString } from 'class-validator';
import type { z } from 'zod';
import { Trim } from '../common/http/request-validation';

export class AnswerBodyDto {
  static readonly contract = AnswerInputSchema;
  @Trim()
  @IsString()
  @Length(10, 10000)
  declare body: z.output<typeof AnswerInputSchema>['body'];
}

export class HelpfulDto {
  static readonly contract = HelpfulInputSchema;
  @IsBoolean()
  declare helpful: z.output<typeof HelpfulInputSchema>['helpful'];
}
