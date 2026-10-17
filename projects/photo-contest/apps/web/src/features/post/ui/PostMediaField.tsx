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
  const inputId = useId();
  const errorId = useId();
  const helpId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    <div className="flex flex-col gap-2 rounded-card has-focus-visible:outline-3 has-focus-visible:outline-accent">
      <label htmlFor={inputId} className="text-label text-ink">
        사진·동영상 선택
        <FieldRequirement required />
      </label>
      <input
        id={inputId}
        type="file"
        aria-required="true"
        accept="image/*,.heic,.heif,video/mp4,video/webm"
        aria-label="사진·동영상 선택"
        ref={(element) => {
          fileInputRef.current = element;
          inputRef(element);
        }}
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
      {media && previewUrl ? (
        <PostMediaPreview
          key={previewUrl}
          file={media}
          src={previewUrl}
          disabled={isSubmitting}
          onReplace={() => fileInputRef.current?.click()}
          onRemove={() => handleMediaChange(null)}
        />
      ) : (
        <button
          type="button"
          aria-label="파일 선택"
          disabled={isSubmitting}
          onClick={() => fileInputRef.current?.click()}
          className="flex min-h-44 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-sunken p-5 text-label text-ink transition-colors hover:bg-neutral-soft active:bg-neutral-soft disabled:cursor-not-allowed disabled:opacity-45 desktop:aspect-square desktop:max-h-[40dvh]"
        >
          <ImagePlus aria-hidden className="size-7" />
          파일 선택
          <span className="text-caption text-muted">사진이나 동영상을 올려 주세요</span>
        </button>
      )}
      <p id={helpId} className="text-caption text-muted">
        사진은 자동으로 줄여요. 동영상 MP4(H.264)·WebM · 100MB · 5분 이하
      </p>
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-danger">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
