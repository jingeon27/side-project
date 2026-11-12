import { z } from 'zod';

import { isReservedNickname, NicknameSchema, PlayerTagSchema } from '@game-feedback/contracts';

import { nicknameLength, RESERVED_NICKNAME_MESSAGE } from '@/features/user';

// 길이 오류 문구는 {min}·{max} 자리에 nicknameLength를 넣어 번역한다.
export const NICKNAME_LENGTH_MESSAGE = '{min}~{max}자로 입력해 주세요';

export const accountSetupSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(nicknameLength.min, NICKNAME_LENGTH_MESSAGE)
    .max(nicknameLength.max, NICKNAME_LENGTH_MESSAGE)
    .refine(
      (value) => NicknameSchema.safeParse(value).success,
      '닉네임에는 문자, 숫자, 공백과 _ . -만 사용할 수 있어요.',
    )
    // 가입은 닉네임을 새로 정하므로 API(NewNicknameSchema)와 같은 예약어 규칙을 따로 안내한다.
    .refine((value) => !isReservedNickname(value), RESERVED_NICKNAME_MESSAGE),
  acceptedTerms: z.boolean().refine((accepted) => accepted, '이용약관과 개인정보 처리방침에 동의해 주세요.'),
  ageConfirmed: z.boolean().refine((confirmed) => confirmed, '만 14세 이상만 가입할 수 있어요.'),
  playerTag: PlayerTagSchema.nullable(),
});
export type TAccountSetupValues = z.infer<typeof accountSetupSchema>;
