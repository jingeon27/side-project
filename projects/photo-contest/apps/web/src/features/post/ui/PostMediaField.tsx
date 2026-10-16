'use client';

import { ImagePlus } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useController } from 'react-hook-form';
import type { Control, UseFormTrigger } from 'react-hook-form';

import { FieldRequirement } from '@/shared/ui/@core/text-field';

import { postSchema } from '../model/post.schema';
import type { TPostInput, TPostValues } from '../model/post.schema';
import { PostMediaPreview } from './PostMediaPreview';

interface IPostMediaFieldProps {
  control: Control<TPostInput, unknown, TPostValues>;
  trigger: UseFormTrigger<TPostInput>;
}

export function PostMediaField({ control, trigger }: IPostMediaFieldProps) {
  const errorId = useId();
  const helpId = useId();
  const {
    field: { value: media, name, ref: inputRef, onChange, onBlur },
    fieldState: { error },
    formState: { isSubmitting },
  } = useController({ control, name: 'media' });
  const previewUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  const handleMediaChange = (file: File | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextUrl = file && postSchema.shape.media.safeParse(file).success ? URL.createObjectURL(file) : null;
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
    onChange(file);
    void trigger('media');
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="flex min-h-touch cursor-pointer flex-col gap-2 rounded-control border border-dashed border-line-strong bg-sunken p-4 text-body text-ink transition-colors has-focus-visible:border-brand has-focus-visible:outline-3 has-focus-visible:outline-accent hover:bg-neutral-soft active:bg-neutral-soft">
        <span>
          사진·동영상 선택
          <FieldRequirement required />
        </span>
        <input
          type="file"
          aria-required="true"
          accept="image/*,.heic,.heif,video/mp4,video/webm"
          aria-label="사진·동영상 선택"
          ref={inputRef}
          name={name}
          onBlur={onBlur}
          disabled={isSubmitting}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${helpId} ${errorId}` : helpId}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (!file) return;
            handleMediaChange(file);
          }}
          className="sr-only"
        />
        <span className="flex min-h-touch items-center gap-2 text-label text-ink">
          <ImagePlus aria-hidden className="size-5" />
          {media ? '파일 바꾸기' : '파일 선택'}
        </span>
        <span id={helpId} className="text-caption text-muted">
          사진은 자동으로 줄여요. 동영상 MP4(H.264)·WebM · 100MB · 5분 이하
        </span>
      </label>
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-danger">
          {error.message}
        </p>
      ) : null}
      {media && previewUrl ? (
        <PostMediaPreview
          key={previewUrl}
          file={media}
          src={previewUrl}
          onRemove={() => handleMediaChange(null)}
        />
      ) : null}
    </div>
  );
}
