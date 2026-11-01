'use client';

import type { UseFormReturn } from 'react-hook-form';

import { TextField } from '@/shared/ui/@core/text-field';

import type { TPostInput, TPostValues } from '../../model/post.schema';

export function PostLinkField({ form }: { form: UseFormReturn<TPostInput, unknown, TPostValues> }) {
  return (
    <TextField
      label="첨부 링크"
      type="url"
      inputMode="url"
      autoCapitalize="none"
      autoCorrect="off"
      maxLength={2048}
      placeholder="https://youtu.be/… 또는 공유할 링크"
      description="사진이나 동영상, 링크를 하나 이상 첨부해 주세요. 파일과 링크를 함께 올려도 좋아요."
      error={form.formState.errors.linkUrl?.message}
      {...form.register('linkUrl', {
        onChange: () => {
          void form.trigger('media');
        },
      })}
    />
  );
}
