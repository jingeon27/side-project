import { z } from 'zod';
import { NicknameSchema } from '@game-feedback/contracts';

export const accountSetupSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(2, '2~20자로 입력해 주세요')
    .max(20, '2~20자로 입력해 주세요')
    .refine(
      (value) => NicknameSchema.safeParse(value).success,
      '닉네임에는 문자, 숫자, 공백과 _ . -만 사용할 수 있어요.',
    ),
  acceptedTerms: z.boolean().refine((accepted) => accepted, '이용약관과 개인정보 처리방침에 동의해 주세요.'),
  ageConfirmed: z.boolean().refine((confirmed) => confirmed, '만 14세 이상만 가입할 수 있어요.'),
});
export type TAccountSetupValues = z.infer<typeof accountSetupSchema>;
