import { z } from 'zod';

import { NicknameSchema } from '@game-feedback/contracts';

export const accountSetupSchema = z.object({
  nickname: NicknameSchema.max(20),
  acceptedTerms: z.boolean().refine((accepted) => accepted, '이용약관과 개인정보 처리방침에 동의해 주세요.'),
  ageConfirmed: z.boolean().refine((confirmed) => confirmed, '만 14세 이상만 가입할 수 있어요.'),
});
export type TAccountSetupValues = z.infer<typeof accountSetupSchema>;
