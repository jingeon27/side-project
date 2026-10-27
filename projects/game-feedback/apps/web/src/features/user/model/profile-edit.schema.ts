import type { UseFormReturn } from 'react-hook-form';
import { z, type ZodObject } from 'zod';

import { ProfileDetailsInputSchema, UpdateProfileInputSchema } from '@game-feedback/contracts';

export const profileDetailsSchema = ProfileDetailsInputSchema;
export const profileLinksSchema = UpdateProfileInputSchema;
export const profilePhotoSchema = z.object({
  file: z.custom<File>(
    (value) =>
      typeof File !== 'undefined' &&
      value instanceof File &&
      value.size > 0 &&
      value.size <= 5 * 1024 * 1024 &&
      ['image/jpeg', 'image/png', 'image/webp'].includes(value.type),
    '5MB 이하의 JPEG, PNG, WebP 사진을 선택해주세요.',
  ),
});

type TZodForm<TSchema extends ZodObject> = UseFormReturn<z.input<TSchema>, unknown, z.output<TSchema>>;
/** 프로필 수정 시트가 세 영역의 초안을 함께 소유해 저장하지 않은 변경을 닫기 전에 확인한다. */
export type TProfileDetailsForm = TZodForm<typeof profileDetailsSchema>;
export type TProfileLinksForm = TZodForm<typeof profileLinksSchema>;
export type TProfilePhotoForm = TZodForm<typeof profilePhotoSchema>;
