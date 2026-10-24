import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import type { z } from 'zod';

import { ListQuerySchema } from '@game-feedback/contracts';

import { Trim } from './request-validation';

export class ListQueryDto {
  static readonly contract = ListQuerySchema;
  @IsOptional()
  @IsIn(['DUEL', 'TEAM'])
  declare battleMode?: z.output<typeof ListQuerySchema>['battleMode'];
  @IsOptional()
  @IsIn(['COACH', 'STUDENT'])
  declare coachingRole?: z.output<typeof ListQuerySchema>['coachingRole'];
  @IsOptional()
  @IsIn(['WAITING', 'ANSWERED'])
  declare feedbackStatus?: z.output<typeof ListQuerySchema>['feedbackStatus'];
  @IsOptional()
  @IsIn(['FEEDBACK', 'FRIEND_SALE', 'FRIENDLY', 'COACHING', 'FREE', 'ALL'])
  declare board?: z.output<typeof ListQuerySchema>['board'];
  @IsOptional()
  @IsString()
  @Length(1, 100)
  declare authorId?: z.output<typeof ListQuerySchema>['authorId'];
  @IsOptional()
  @IsString()
  @MaxLength(200)
  declare cursor?: z.output<typeof ListQuerySchema>['cursor'];
  @IsInt()
  @Min(1)
  @Max(50)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? Number(value) : value))
  limit = 12;
  @IsOptional()
  @IsString()
  @MaxLength(80)
  declare category?: z.output<typeof ListQuerySchema>['category'];
  @IsOptional()
  @IsIn(['true', 'false'])
  declare unanswered?: z.output<typeof ListQuerySchema>['unanswered'];
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  declare q?: z.output<typeof ListQuerySchema>['q'];
}
