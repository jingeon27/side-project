'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';

import { Camera } from 'lucide-react';
import { useController, type UseFormReturn } from 'react-hook-form';

import { Button } from '@/shared/ui/@core/button';
import { FieldRequirement } from '@/shared/ui/@core/text-field';

import { groupProfileSchema, type TGroupProfileInput } from '../model/group-profile.schema';

export function GroupAvatarField({
  form,
  currentUrl,
}: {
  form: UseFormReturn<TGroupProfileInput>;
  currentUrl?: string | null;
}) {
  const inputId = useId(),
    errorId = useId();
  const {
    field: { name, ref: inputRef, onBlur, onChange },
    fieldState,
  } = useController({ control: form.control, name: 'avatar' });
  const { field: removed } = useController({ control: form.control, name: 'removeAvatar' });
  const previewRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );
  const handleAvatarChange = (file: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url =
      file && groupProfileSchema.shape.avatar.safeParse(file).success ? URL.createObjectURL(file) : null;
    previewRef.current = url;
    setPreview(url);
    onChange(file);
    void form.trigger('avatar');
  };
  const src = preview ?? (removed.value ? null : currentUrl);
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={inputId} className="text-label text-ink">
        그룹 사진
        <FieldRequirement required={false} />
      </label>
      <div className="flex items-center gap-5">
        <label
          htmlFor={inputId}
          className="relative flex size-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-line bg-sunken text-muted has-focus-visible:outline-3 has-focus-visible:outline-accent"
        >
          <input
            id={inputId}
            aria-label="그룹 사진 선택"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            name={name}
            ref={inputRef}
            onBlur={onBlur}
            disabled={form.formState.isSubmitting}
            aria-invalid={Boolean(fieldState.error)}
            aria-describedby={fieldState.error ? errorId : undefined}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (!file) return;
              removed.onChange(false);
              handleAvatarChange(file);
            }}
          />
          {src ? (
            <Image
              src={src}
              alt="그룹 사진 미리보기"
              width={96}
              height={96}
              unoptimized
              className="size-full object-cover"
            />
          ) : (
            <Camera aria-hidden className="size-8" strokeWidth={1.5} />
          )}
        </label>
        <div className="min-w-0">
          <p className="text-caption text-muted">사진을 눌러 선택하거나 바꿔 주세요.</p>
          <p className="mt-1 text-micro text-muted">JPEG·PNG·WebP · 최대 10MB</p>
          {src ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 px-0 text-danger"
              disabled={form.formState.isSubmitting}
              onClick={() => {
                handleAvatarChange(null);
                removed.onChange(true);
              }}
            >
              사진 삭제
            </Button>
          ) : null}
        </div>
      </div>
      {fieldState.error ? (
        <p id={errorId} role="alert" className="text-caption text-danger">
          {fieldState.error.message}
        </p>
      ) : null}
    </div>
  );
}
