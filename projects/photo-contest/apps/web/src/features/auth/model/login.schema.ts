import { z } from 'zod';

/** 개발 서버 닉네임 로그인 */
export const devLoginSchema = z.object({
  nickname: z.string().trim().min(1, '닉네임을 입력해 주세요.').max(24, '24자 이내로 입력해 주세요.'),
});

export type TDevLoginInput = z.input<typeof devLoginSchema>;
