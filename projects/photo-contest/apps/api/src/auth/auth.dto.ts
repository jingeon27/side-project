import { Transform } from 'class-transformer';
import { IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

import { ERROR_CODE } from '../common/errors';
import { loginIdValue, trimValue } from '../common/input-validation';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, TEXT_LIMIT } from '../config/limits';

const LOGIN_FAILED = {
  message: '아이디 또는 비밀번호를 확인해 주세요.',
  context: { code: ERROR_CODE.UNAUTHENTICATED },
};

export class LoginWithPasswordDto {
  @Transform(loginIdValue)
  @IsString(LOGIN_FAILED)
  @Matches(/^[a-z0-9_]{3,24}$/, LOGIN_FAILED)
  loginId = '';

  // 비밀번호의 공백과 유니코드는 입력 그대로 보존한다.
  @IsString(LOGIN_FAILED)
  @Length(1, PASSWORD_MAX_LENGTH, LOGIN_FAILED)
  password = '';
}

export class RegisterWithPasswordDto {
  @Transform(loginIdValue)
  @IsString({ message: '아이디를 입력해 주세요.' })
  @Matches(/^[a-z0-9_]{3,24}$/, { message: '아이디는 영문·숫자·밑줄 3~24자로 입력해 주세요.' })
  loginId = '';

  @IsString({ message: '비밀번호를 입력해 주세요.' })
  @MinLength(PASSWORD_MIN_LENGTH, { message: '비밀번호는 8자 이상 입력해 주세요.' })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: '비밀번호는 128자 이내로 입력해 주세요.' })
  password = '';

  @Transform(trimValue)
  @IsString({ message: '닉네임을 입력해 주세요.' })
  @Length(1, TEXT_LIMIT.NICKNAME, { message: '닉네임은 1~24자로 입력해 주세요.' })
  nickname = '';
}
