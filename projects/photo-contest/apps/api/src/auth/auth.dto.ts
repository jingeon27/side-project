import { Transform } from 'class-transformer';
import { IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

import { ERROR_CODE, ERROR_MESSAGE } from '../common/errors';
import { loginIdValue, trimValue } from '../common/input-validation';
import {
  APP_LOGIN_CODE_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PKCE_VERIFIER_MAX_LENGTH,
  PKCE_VERIFIER_MIN_LENGTH,
  TEXT_LIMIT,
} from '../config/limits';

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

export class DevLoginDto {
  @Transform(trimValue)
  @IsString({ message: '닉네임은(는) 1~24자여야 합니다.' })
  @Length(1, TEXT_LIMIT.NICKNAME, { message: '닉네임은(는) 1~24자여야 합니다.' })
  nickname = '';
}

const APP_LOGIN_FAILED = {
  message: ERROR_MESSAGE.APP_LOGIN_REJECTED,
  context: { code: ERROR_CODE.FORBIDDEN },
};

export class AppLoginExchangeDto {
  @IsString(APP_LOGIN_FAILED)
  @Length(1, APP_LOGIN_CODE_MAX_LENGTH, APP_LOGIN_FAILED)
  code = '';

  @IsString(APP_LOGIN_FAILED)
  @Matches(
    new RegExp(`^[A-Za-z0-9._~-]{${PKCE_VERIFIER_MIN_LENGTH},${PKCE_VERIFIER_MAX_LENGTH}}$`),
    APP_LOGIN_FAILED,
  )
  verifier = '';
}
