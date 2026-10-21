import { IsBoolean, IsString, Length } from 'class-validator';
import type { z } from 'zod';

import { UserBanInputSchema, VerificationInputSchema } from '@game-feedback/contracts';

import { Trim } from '../../common/http/request-validation';

export class VerificationDto {
  static readonly contract = VerificationInputSchema;
  @IsBoolean()
  declare isVerified: z.output<typeof VerificationInputSchema>['isVerified'];
}

export class UserBanDto {
  static readonly contract = UserBanInputSchema;
  @IsBoolean()
  declare banned: z.output<typeof UserBanInputSchema>['banned'];
  @Trim()
  @IsString()
  @Length(1, 500)
  declare reason: z.output<typeof UserBanInputSchema>['reason'];
}
