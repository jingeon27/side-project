import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { z } from 'zod';

import { ReportInputSchema } from '@game-feedback/contracts';

import { Trim } from '../common/http/request-validation';

export class CreateReportDto {
  static readonly contract = ReportInputSchema;
  @IsIn(['POST', 'ANSWER', 'COMMENT', 'USER'])
  declare targetType: z.output<typeof ReportInputSchema>['targetType'];
  @IsString()
  @MinLength(1)
  declare targetId: z.output<typeof ReportInputSchema>['targetId'];
  @IsIn(['SPAM', 'HARASSMENT', 'PERSONAL_INFORMATION', 'IMPERSONATION', 'FRAUD', 'OTHER'])
  declare reason: z.output<typeof ReportInputSchema>['reason'];
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  declare detail?: z.output<typeof ReportInputSchema>['detail'];
}
