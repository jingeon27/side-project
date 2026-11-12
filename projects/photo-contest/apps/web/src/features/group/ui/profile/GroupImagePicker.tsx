'use client';

import { useId } from 'react';
import Image from 'next/image';

import { Camera } from 'lucide-react';

import { useObjectUrl } from '@/shared/model/object-url.hook';
import { Button } from '@/shared/ui/@core/button';

import { groupProfileSchema } from '../../model/group-profile.schema';

export function GroupImagePicker({
  label,
  value,
  cover = false,
  currentUrl,
  disabled,
  error,
  onChange,
}: {
  label: string;
  value: File | null | undefined;
  cover?: boolean;
  currentUrl?: string | null;
  disabled?: boolean;
  error?: string;
  onChange: (file: File | null) => void;
}) {
  const id = useId();
  const preview = useObjectUrl(
    value && groupProfileSchema.shape.avatar.safeParse(value).success ? value : null,
  );
  const src = preview ?? currentUrl;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <label htmlFor={id} className="text-label text-ink">
        {label}
      </label>
      <label
        htmlFor={id}
        className={`relative flex cursor-pointer items-center justify-center overflow-hidden rounded-card border border-line bg-sunken text-muted has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring ${cover ? 'aspect-[3/1] w-full' : 'size-24'}`}
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
            if (file) onChange(file);
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
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}>
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
