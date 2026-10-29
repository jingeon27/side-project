'use client';

import { useId } from 'react';
import Image from 'next/image';

import { Camera } from 'lucide-react';
import {
  useController,
  type Control,
  type FieldPathByValue,
  type FieldValues,
  type UseFormTrigger,
} from 'react-hook-form';
import type { z } from 'zod';

import { useObjectUrl } from '../../../model/object-url.hook';
import { Button } from '../button';
import { FieldRequirement } from '../text-field';

interface IImageFileFieldProps<TInput extends FieldValues, TOutput> {
  control: Control<TInput, unknown, TOutput>;
  /** 고르는 즉시 형식·크기를 검사해 오류를 보여 준다. */
  trigger: UseFormTrigger<TInput>;
  /** 새로 고른 사진(File | null) */
  name: FieldPathByValue<TInput, File | null>;
  /** 지금 사진을 지울지(boolean) */
  removeName: FieldPathByValue<TInput, boolean>;
  /** 입력 이름. 선택 버튼은 "{label} 선택", 미리보기는 "{label} 미리보기"가 된다. */
  label: string;
  /** 저장된 사진 주소 */
  currentUrl?: string | null;
  /** 통과한 파일만 미리 보여 준다(보통 폼 스키마의 사진 필드). */
  fileSchema: z.ZodType;
}

/** 원형 사진 하나를 고르고 미리 보고 바꾸거나 지우는 선택 입력. 그룹·프로필 사진이 함께 쓴다. */
export function ImageFileField<TInput extends FieldValues, TOutput>({
  control,
  trigger,
  name,
  removeName,
  label,
  currentUrl,
  fileSchema,
}: IImageFileFieldProps<TInput, TOutput>) {
  const inputId = useId();
  const errorId = useId();
  const {
    field: { value, ref, onBlur, onChange },
    fieldState,
    formState: { isSubmitting },
  } = useController({ control, name });
  const { field: removed } = useController({ control, name: removeName });
  // 이름으로 고른 필드의 값은 제네릭 경로 타입이라 실제 File인지 확인해 좁힌다.
  const selected: unknown = value;
  const picked = selected instanceof File && fileSchema.safeParse(selected).success ? selected : null;
  const preview = useObjectUrl(picked);
  const src = preview ?? (removed.value ? null : currentUrl);
  const handleChange = (file: File | null) => {
    onChange(file);
    void trigger(name);
  };
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={inputId} className="text-label text-ink">
        {label}
        <FieldRequirement required={false} />
      </label>
      <div className="flex items-center gap-5">
        <label
          htmlFor={inputId}
          className="relative flex size-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-line bg-sunken text-muted has-focus-visible:outline-3 has-focus-visible:outline-accent"
        >
          <input
            id={inputId}
            aria-label={`${label} 선택`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            name={name}
            ref={ref}
            onBlur={onBlur}
            disabled={isSubmitting}
            aria-invalid={Boolean(fieldState.error)}
            aria-describedby={fieldState.error ? errorId : undefined}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              // 같은 사진을 다시 골라도 change가 일어나게 비운다.
              event.currentTarget.value = '';
              if (!file) return;
              removed.onChange(false);
              handleChange(file);
            }}
          />
          {src ? (
            <Image
              src={src}
              alt={`${label} 미리보기`}
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
          <p className="mt-1 text-micro text-muted">
            JPEG, PNG, WebP 형식의 사진을 최대 10MB까지 올릴 수 있어요.
          </p>
          {src ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 px-0 text-danger"
              disabled={isSubmitting}
              onClick={() => {
                handleChange(null);
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
