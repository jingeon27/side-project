import { IsBoolean, IsIn, IsString, Length, MinLength } from 'class-validator';
import type { z } from 'zod';

import { HideInputSchema, ReportReviewInputSchema } from '@game-feedback/contracts';

import { Trim } from '../../common/http/request-validation';

export class ReviewReportDto {
  static readonly contract = ReportReviewInputSchema;
  @IsIn(['REVIEWED', 'DISMISSED'])
  declare status: z.output<typeof ReportReviewInputSchema>['status'];
}

export class HideContentDto {
  static readonly contract = HideInputSchema;
  @IsIn(['POST', 'ANSWER', 'COMMENT'])
  declare targetType: z.output<typeof HideInputSchema>['targetType'];
  @IsString()
  @MinLength(1)
  declare targetId: z.output<typeof HideInputSchema>['targetId'];
  @IsBoolean()
  declare hidden: z.output<typeof HideInputSchema>['hidden'];
  @Trim()
  @IsString()
  @Length(1, 500)
  declare reason: z.output<typeof HideInputSchema>['reason'];
}
