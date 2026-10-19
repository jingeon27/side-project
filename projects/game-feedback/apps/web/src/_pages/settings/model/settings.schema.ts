import { z } from 'zod';

export const deleteAccountSchema = z.object({
  confirmation: z.string().refine((value) => value === '탈퇴', "계속하려면 '탈퇴'를 입력해 주세요."),
});
