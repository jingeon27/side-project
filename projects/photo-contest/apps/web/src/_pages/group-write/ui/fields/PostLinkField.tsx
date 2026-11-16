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
      description="파일 없이 링크만 올려도 되고, 파일과 함께 올려도 좋아요."
      error={form.formState.errors.linkUrl?.message}
      {...form.register('linkUrl', {
        onChange: () => {
          void form.trigger('media');
        },
      })}
    />
  );
}
