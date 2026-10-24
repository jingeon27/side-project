import { IsBoolean, IsIn, IsOptional, IsString, IsUrl, Matches } from 'class-validator';

import { DevLoginDto } from '../auth/auth.dto';
import { PKCE_CHALLENGE_LENGTH } from '../config/limits';
import { PHASE, type TPhase } from '../contest/contest.policy';

export class CreateTestUserDto extends DevLoginDto {
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

export class CreateTestAppLoginTicketDto extends DevLoginDto {
  @IsString()
  @Matches(new RegExp(`^[A-Za-z0-9_-]{${PKCE_CHALLENGE_LENGTH}}$`))
  challenge = '';
}
