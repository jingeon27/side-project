import { z } from 'zod';

import { completedGroupImagesSchema } from './group-image-upload.schema';

export const groupProfileSchema = z.object({
  completedImages: completedGroupImagesSchema,
  name: z.string().trim().min(1, '그룹 이름을 입력해 주세요.').max(40, '40자 이내로 입력해 주세요.'),
  description: z.string().trim().max(500, '500자 이내로 입력해 주세요.'),
  avatar: z
    .instanceof(File)
    .nullable()
    .refine((file) => !file || file.size <= 10 * 1024 * 1024, '10MB 이하의 사진을 선택해 주세요.')
    .refine(
      (file) => !file || ['image/jpeg', 'image/png', 'image/webp'].includes(file.type),
      'JPEG, PNG, WebP 형식의 사진을 선택해 주세요.',
    ),
  removeAvatar: z.boolean(),
  cover: z
    .instanceof(File)
    .nullable()
    .refine((file) => !file || file.size <= 10 * 1024 * 1024, '10MB 이하의 사진을 선택해 주세요.')
    .refine(
      (file) => !file || ['image/jpeg', 'image/png', 'image/webp'].includes(file.type),
      'JPEG, PNG, WebP 형식의 사진을 선택해 주세요.',
    )
    .default(null),
  removeCover: z.boolean().default(false),
});
export type TGroupProfileInput = z.input<typeof groupProfileSchema>;
