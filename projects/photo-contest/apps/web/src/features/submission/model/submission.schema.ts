import { z } from 'zod';

import { isImageFile } from '@/shared/lib/image.helper';

/** 브라우저가 줄이기 전에 받는 원본 상한. 이보다 크면 휴대폰에서 다루기도 버겁다. */
const MAX_ORIGINAL_BYTES = 50 * 1024 * 1024;

/** 사진 제출. 사진은 브라우저가 줄인 뒤 올리고, 형식·크기의 최종 판단은 서버가 한다. */
export const uploadPhotoSchema = z.object({
  photo: z
    .instanceof(File)
    .nullable()
    .transform((photo, context) => {
      if (photo) return photo;
      context.addIssue({ code: 'custom', message: '사진 한 장을 선택해 주세요.' });
      return z.NEVER;
    })
    .refine(isImageFile, 'JPEG, PNG, WebP, HEIC 사진을 선택해 주세요.')
    .refine((photo) => photo.size <= MAX_ORIGINAL_BYTES, '50MB 이하의 사진을 선택해 주세요.'),
  caption: z.string().trim().min(1, '사진 설명을 입력해 주세요.').max(160, '160자 이내로 입력해 주세요.'),
  rightsConfirmed: z
    .boolean()
    .refine((confirmed) => confirmed, '사진을 공유할 권리와 촬영된 사람의 동의를 확인해 주세요.'),
});
