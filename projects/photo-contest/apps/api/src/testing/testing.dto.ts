import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUrl, Length } from 'class-validator';

import { trimValue } from '../common/input-validation';
import { TEXT_LIMIT } from '../config/limits';
import { PHASE, type TPhase } from '../contest/contest.policy';

export class CreateTestUserDto {
  @Transform(trimValue)
  @IsString()
  @Length(1, TEXT_LIMIT.NICKNAME)
  nickname = '';

  @IsOptional()
  @IsBoolean()
  needsOnboarding?: boolean;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  avatar?: string;
}

export class MoveTestContestDto {
  @IsIn(Object.values(PHASE), { message: '테스트 입력을 확인해 주세요.' })
  declare phase: TPhase;
}
