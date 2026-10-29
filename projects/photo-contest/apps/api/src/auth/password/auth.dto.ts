import { z } from 'zod';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, TEXT_LIMIT } from '../../config/limits';

const LOGIN_FAILED = '아이디 또는 비밀번호를 확인해 주세요.';
const LOGIN_ID_PATTERN = /^[a-z0-9_]{3,24}$/;

export const LoginWithPasswordSchema = z.strictObject(
  {
    loginId: z.string({ error: LOGIN_FAILED }).trim().toLowerCase().regex(LOGIN_ID_PATTERN, LOGIN_FAILED),
    // Password spaces and Unicode must reach password verification unchanged.
    password: z.string({ error: LOGIN_FAILED }).min(1, LOGIN_FAILED).max(PASSWORD_MAX_LENGTH, LOGIN_FAILED),
  },
  { error: LOGIN_FAILED },
);
export type TLoginWithPasswordDto = z.output<typeof LoginWithPasswordSchema>;

export const RegisterWithPasswordSchema = z.strictObject({
  loginId: z
    .string({ error: '아이디를 입력해 주세요.' })
    .trim()
    .toLowerCase()
    .regex(LOGIN_ID_PATTERN, '아이디는 영문, 숫자, 밑줄(_)을 사용해 3~24자로 입력해 주세요.'),
  password: z
    .string({ error: '비밀번호를 입력해 주세요.' })
    .min(PASSWORD_MIN_LENGTH, '비밀번호는 8자 이상 입력해 주세요.')
    .max(PASSWORD_MAX_LENGTH, '비밀번호는 128자 이내로 입력해 주세요.'),
  nickname: z
    .string({ error: '닉네임을 입력해 주세요.' })
    .trim()
    .min(1, '닉네임은 1~24자로 입력해 주세요.')
    .max(TEXT_LIMIT.NICKNAME, '닉네임은 1~24자로 입력해 주세요.'),
});
export type TRegisterWithPasswordDto = z.output<typeof RegisterWithPasswordSchema>;
