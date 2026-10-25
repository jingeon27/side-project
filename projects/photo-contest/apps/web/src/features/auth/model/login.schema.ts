import { z } from 'zod';

const nickname = z.string().trim().min(1, '닉네임을 입력해 주세요.').max(24, '24자 이내로 입력해 주세요.');

const loginId = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,24}$/, '아이디는 영문·숫자·밑줄 3~24자로 입력해 주세요.');
export const passwordLoginSchema = z.object({
  loginId,
  password: z.string().min(1, '비밀번호를 입력해 주세요.').max(128, '128자 이내로 입력해 주세요.'),
});
export const passwordRegisterSchema = passwordLoginSchema.extend({
  nickname,
  password: z.string().min(8, '비밀번호는 8자 이상 입력해 주세요.').max(128, '128자 이내로 입력해 주세요.'),
});
