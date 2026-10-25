import { IsString, Length, Matches } from 'class-validator';

import { AdminLoginInputSchema } from '@game-feedback/contracts';

import { Trim } from '../../common/http/request-validation';

export class AdminLoginDto {
  static readonly contract = AdminLoginInputSchema;
  @Trim()
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]{3,64}$/)
  declare username: string;
  @IsString()
  @Length(8, 128)
  declare password: string;
}
