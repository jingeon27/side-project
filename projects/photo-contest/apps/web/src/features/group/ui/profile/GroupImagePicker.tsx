'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';

import { Camera } from 'lucide-react';

import { Button } from '@/shared/ui/@core/button';

import { groupProfileSchema } from '../../model/group-profile.schema';

export function GroupImagePicker({
  label,
  cover = false,
  currentUrl,
  disabled,
  error,
  onChange,
}: {
  label: string;
  cover?: boolean;
  currentUrl?: string | null;
  disabled?: boolean;
  error?: string;
  onChange: (file: File | null) => void;
}) {
  const id = useId();
  const objectUrl = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null | undefined>(undefined);
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
  const choose = (file: File | null) => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url =
      file && groupProfileSchema.shape.avatar.safeParse(file).success ? URL.createObjectURL(file) : null;
    objectUrl.current = url;
    setPreview(url);
    onChange(file);
  };
  const src = preview === undefined ? currentUrl : preview;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <label htmlFor={id} className="text-label text-ink">
        {label}
      </label>
      <label
        htmlFor={id}
        className={`relative flex cursor-pointer items-center justify-center overflow-hidden border border-line bg-sunken text-muted has-focus-visible:outline-3 has-focus-visible:outline-accent ${cover ? 'aspect-[3/1] w-full rounded-card' : 'size-24 rounded-full'}`}
      >
        <input
          id={id}
          type="file"
          aria-label={`${label} 선택`}
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) choose(file);
          }}
        />
        {src ? (
          <Image src={src} alt={`${label} 미리보기`} fill unoptimized className="object-cover" />
        ) : (
          <Camera aria-hidden className="size-8" />
        )}
      </label>
      <div className="flex min-h-touch items-center justify-between gap-3">
        <p className="text-caption text-muted">JPEG, PNG, WebP 형식의 사진을 최대 10MB까지 올릴 수 있어요.</p>
        {src ? (
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => choose(null)}>
            {label} 삭제
          </Button>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
