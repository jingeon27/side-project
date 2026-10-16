import { Field } from '@base-ui/react/field';
import type { ComponentProps } from 'react';

import { cn } from '../../../lib/cn.helper';
import { FieldRequirement } from './FieldRequirement';

const CONTROL_CLASS_NAME = cn(
  'w-full rounded-control border border-line-strong bg-surface px-3.5 text-input text-ink outline-none transition-colors',
  'placeholder:text-subtle focus:border-brand data-disabled:bg-sunken data-disabled:text-muted data-invalid:border-danger',
);

interface IFieldTextProps {
  /** 보이는 레이블. 입력과 자동으로 연결된다. */
  label: string;
  /** 입력 아래 도움말 */
  description?: string;
  /** 있으면 오류로 표시하고 읽어 준다(react-hook-form의 errors.x?.message). */
  error?: string;
  className?: string;
}

/** 도움말과 오류 안내. Field가 입력의 aria-describedby·aria-invalid로 연결한다. */
function FieldMessages({ description, error }: Pick<IFieldTextProps, 'description' | 'error'>) {
  return (
    <>
      {description ? (
        <Field.Description className="text-caption text-muted">{description}</Field.Description>
      ) : null}
      <Field.Error match={Boolean(error)} className="text-caption text-danger">
        {error}
      </Field.Error>
    </>
  );
}

export interface ITextFieldProps extends IFieldTextProps, Omit<ComponentProps<'input'>, 'className'> {}

/** 한 줄 입력. `{...register('name')}`을 그대로 넘긴다. */
export function TextField({ label, description, error, className, ...inputProps }: ITextFieldProps) {
  return (
    <Field.Root
      invalid={Boolean(error)}
      disabled={inputProps.disabled}
      className={cn('flex flex-col gap-1.5', className)}
    >
      <div className="flex items-center gap-1">
        <Field.Label className="text-label text-ink">{label}</Field.Label>
        <FieldRequirement required={inputProps.required} />
      </div>
      <Field.Control {...inputProps} className={cn(CONTROL_CLASS_NAME, 'h-12')} />
      <FieldMessages description={description} error={error} />
    </Field.Root>
  );
}

export interface ITextAreaProps extends IFieldTextProps, Omit<ComponentProps<'textarea'>, 'className'> {}

/** 여러 줄 입력. `{...register('name')}`을 그대로 넘긴다. */
export function TextArea({
  label,
  description,
  error,
  className,
  rows = 4,
  ...textareaProps
}: ITextAreaProps) {
  return (
    <Field.Root
      invalid={Boolean(error)}
      disabled={textareaProps.disabled}
      className={cn('flex flex-col gap-1.5', className)}
    >
      <div className="flex items-center gap-1">
        <Field.Label className="text-label text-ink">{label}</Field.Label>
        <FieldRequirement required={textareaProps.required} />
      </div>
      <Field.Control
        required={textareaProps.required}
        render={
          <textarea {...textareaProps} rows={rows} className={cn(CONTROL_CLASS_NAME, 'resize-none py-3')} />
        }
      />
      <FieldMessages description={description} error={error} />
    </Field.Root>
  );
}
