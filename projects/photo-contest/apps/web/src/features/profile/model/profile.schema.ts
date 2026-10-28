import { z } from 'zod';

export const profileSchema = z.object({
  nickname: z.string().trim().min(1, '닉네임을 입력해 주세요.').max(24, '24자 이내로 입력해 주세요.'),
  avatar: z
    .instanceof(File)
    .nullable()
    .refine((file) => !file || file.size > 0, '빈 파일은 올릴 수 없습니다.')
    .refine((file) => !file || file.size <= 10 * 1024 * 1024, '10MB 이하의 사진을 선택해 주세요.')
    .refine(
      (file) => !file || ['image/jpeg', 'image/png', 'image/webp'].includes(file.type),
      'JPEG·PNG·WebP 사진을 선택해 주세요.',
    ),
  removeAvatar: z.boolean(),
});

/** 처음 가입할 때만 약관 동의를 함께 받는다. MY의 프로필 수정에는 동의 칸이 없다. */
export const onboardingSchema = profileSchema
  .extend({ acceptedTerms: z.boolean() })
  .refine((values) => values.acceptedTerms, {
    message: '이용약관과 개인정보 처리방침을 확인하고 동의해 주세요.',
    path: ['acceptedTerms'],
  });
