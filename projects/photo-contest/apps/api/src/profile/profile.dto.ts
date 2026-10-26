import { z } from 'zod';

import { MAX_UPLOAD_BYTES, TEXT_LIMIT } from '../config/limits';

export const RequestProfileAvatarUploadSchema = z.strictObject({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp'], {
    error: 'JPEG·PNG·WebP 사진을 선택해 주세요.',
  }),
  byteSize: z
    .int({ error: '파일 크기를 확인해 주세요.' })
    .min(1, '빈 파일은 올릴 수 없습니다.')
    .max(MAX_UPLOAD_BYTES, '10MB 이하의 사진을 선택해 주세요.'),
});
export type TRequestProfileAvatarUploadDto = z.output<typeof RequestProfileAvatarUploadSchema>;

export const CompleteProfileAvatarUploadSchema = z.strictObject({
  uploadId: z
    .string({ error: '업로드 요청을 확인해 주세요.' })
    .min(1, '업로드 요청을 확인해 주세요.')
    .max(64, '업로드 요청을 확인해 주세요.'),
});
export type TCompleteProfileAvatarUploadDto = z.output<typeof CompleteProfileAvatarUploadSchema>;

export const UpdateMyProfileSchema = z.strictObject({
  nickname: z
    .string({ error: '닉네임을 입력해 주세요.' })
    .trim()
    .min(1, '닉네임은 1~24자로 입력해 주세요.')
    .max(TEXT_LIMIT.NICKNAME, '닉네임은 1~24자로 입력해 주세요.'),
  avatarId: z
    .string({ error: '사진 업로드를 확인해 주세요.' })
    .min(1, '사진 업로드를 확인해 주세요.')
    .max(64, '사진 업로드를 확인해 주세요.')
    .nullish(),
  removeAvatar: z.boolean({ error: '사진 삭제 여부를 확인해 주세요.' }).nullish(),
});
export type TUpdateMyProfileDto = z.output<typeof UpdateMyProfileSchema>;

export const CompleteOnboardingSchema = UpdateMyProfileSchema.extend({
  acceptedTerms: z.literal(true, { error: '이용약관과 개인정보 처리방침을 확인하고 동의해 주세요.' }),
});
export type TCompleteOnboardingDto = z.output<typeof CompleteOnboardingSchema>;
