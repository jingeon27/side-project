import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { ProfileDetailsInputSchema } from '@game-feedback/contracts';

import { isAvatarFile } from '@/features/user';

export const profileEditSchema = ProfileDetailsInputSchema.extend({
  file: z
    .custom<File>(
      (value) => typeof File !== 'undefined' && value instanceof File && isAvatarFile(value),
      '5MB 이하의 JPEG, PNG, WebP 사진을 선택해주세요.',
    )
    .optional(),
  removePhoto: z.boolean(),
});

export type TProfileEditInput = z.output<typeof profileEditSchema>;
export type TProfileEditForm = UseFormReturn<z.input<typeof profileEditSchema>, unknown, TProfileEditInput>;
