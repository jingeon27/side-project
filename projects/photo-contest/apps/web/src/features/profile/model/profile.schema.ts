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
  acceptedTerms: z.boolean(),
});
export type TProfileInput = z.input<typeof profileSchema>;

export const onboardingSchema = profileSchema.refine((values) => values.acceptedTerms, {
  message: '이용약관과 개인정보 처리방침을 확인하고 동의해 주세요.',
  path: ['acceptedTerms'],
});
