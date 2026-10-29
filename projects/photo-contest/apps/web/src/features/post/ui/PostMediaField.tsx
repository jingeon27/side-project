'use client';

import { useCallback, useId, useRef } from 'react';

import { ImagePlus } from 'lucide-react';
import { useController, useWatch, type Control, type UseFormTrigger } from 'react-hook-form';

import { useIsSSR } from '@/shared/model/is-ssr.hook';
import { useObjectUrl } from '@/shared/model/object-url.hook';
import { FieldRequirement } from '@/shared/ui/@core/text-field';

import { postSchema, type TPostInput, type TPostValues } from '../model/post.schema';
import { PostMediaPreview } from './PostMediaPreview';

interface IPostMediaFieldProps {
  control: Control<TPostInput, unknown, TPostValues>;
  trigger: UseFormTrigger<TPostInput>;
}

export function PostMediaField({ control, trigger }: IPostMediaFieldProps) {
  const isSSR = useIsSSR();
  const inputId = useId();
  const errorId = useId();
  const helpId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    field: { value: media, name, ref: inputRef, onChange, onBlur },
    fieldState: { error },
    formState: { isSubmitting },
  } = useController({ control, name: 'media' });
  const handleInputRef = useCallback(
    (element: HTMLInputElement | null) => {
      fileInputRef.current = element;
      inputRef(element);
      if (!element) return;
      return () => {
        fileInputRef.current = null;
        inputRef(null);
      };
    },
    [inputRef],
  );
  // 형식·크기가 맞지 않는 파일은 미리 보여 주지 않고 오류만 보여 준다.
  const previewUrl = useObjectUrl(media && postSchema.shape.media.safeParse(media).success ? media : null);
  const linkUrl = useWatch({ control, name: 'linkUrl' });
  const required = !linkUrl?.trim();

  const handleMediaChange = (file: File | null) => {
    onChange(file);
    void trigger('media');
  };

  return (
    <div className="flex flex-col gap-2 rounded-card has-focus-visible:outline-3 has-focus-visible:outline-accent">
      <label htmlFor={inputId} className="text-label text-ink">
        사진 또는 동영상 선택
        <FieldRequirement required={required} />
      </label>
      <input
        id={inputId}
        type="file"
        aria-required={required}
        accept="image/*,.heic,.heif,video/mp4,video/webm"
        aria-label="사진 또는 동영상 선택"
        ref={handleInputRef}
        name={name}
        onBlur={onBlur}
        disabled={isSSR || isSubmitting}
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
          disabled={isSSR || isSubmitting}
          onReplace={() => fileInputRef.current?.click()}
          onRemove={() => handleMediaChange(null)}
        />
      ) : (
        <button
          type="button"
          aria-label="파일 선택"
          disabled={isSSR || isSubmitting}
          onClick={() => fileInputRef.current?.click()}
          className="flex min-h-44 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-sunken p-5 text-label text-ink transition-colors hover:bg-neutral-soft active:bg-neutral-soft disabled:cursor-not-allowed disabled:opacity-45 desktop:aspect-square desktop:max-h-[40dvh]"
        >
          <ImagePlus aria-hidden className="size-7" />
          파일 선택
          <span className="text-caption text-muted">사진이나 동영상을 선택해 주세요</span>
        </button>
      )}
      <p id={helpId} className="text-caption text-muted">
        큰 사진은 크기를 줄여서 올려요. 동영상은 MP4, WebM 형식으로 100MB, 5분까지 올릴 수 있어요.
      </p>
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-danger">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
