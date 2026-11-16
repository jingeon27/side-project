import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { isReservedNickname, NicknameSchema, ProfileDetailsInputSchema } from '@game-feedback/contracts';

import { isAvatarFile, RESERVED_NICKNAME_MESSAGE } from '@/features/user';

// API처럼 닉네임을 바꿀 때만 예약어를 막는다. 규칙 전에 정한 닉네임으로도 프로필을 저장할 수 있다.
export function profileEditSchema(currentNickname: string) {
  return ProfileDetailsInputSchema.extend({
    nickname: NicknameSchema.refine(
      (nickname) => nickname === currentNickname || !isReservedNickname(nickname),
      RESERVED_NICKNAME_MESSAGE,
    ),
    file: z
      .custom<File>(
        (value) => typeof File !== 'undefined' && value instanceof File && isAvatarFile(value),
        '5MB 이하의 JPEG, PNG, WebP 사진을 선택해주세요.',
      )
      .optional(),
    removePhoto: z.boolean(),
  });
}

type TProfileEditSchema = ReturnType<typeof profileEditSchema>;
export type TProfileEditInput = z.output<TProfileEditSchema>;
export type TProfileEditForm = UseFormReturn<z.input<TProfileEditSchema>, unknown, TProfileEditInput>;
