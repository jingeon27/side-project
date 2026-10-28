import type { UseFormReturn } from 'react-hook-form';
import { z, type ZodObject } from 'zod';

import { ProfileDetailsInputSchema, UpdateProfileInputSchema } from '@game-feedback/contracts';

import { isAvatarFile } from '../lib/avatar-file';

export const profileDetailsSchema = ProfileDetailsInputSchema;
export const profileLinksSchema = UpdateProfileInputSchema;
export const profilePhotoSchema = z.object({
  file: z.custom<File>(
    (value) => typeof File !== 'undefined' && value instanceof File && isAvatarFile(value),
    '5MB 이하의 JPEG, PNG, WebP 사진을 선택해주세요.',
  ),
});

type TZodForm<TSchema extends ZodObject> = UseFormReturn<z.input<TSchema>, unknown, z.output<TSchema>>;
/** 프로필 수정 폼이 세 영역의 초안을 함께 소유해, 한 영역을 저장해도 다른 영역의 초안을 지킨다. */
export type TProfileDetailsForm = TZodForm<typeof profileDetailsSchema>;
export type TProfileLinksForm = TZodForm<typeof profileLinksSchema>;
export type TProfilePhotoForm = TZodForm<typeof profilePhotoSchema>;
