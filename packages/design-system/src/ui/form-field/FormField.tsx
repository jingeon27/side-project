'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useMemo,
  type AriaAttributes,
  type ReactNode,
} from 'react';

import { cn } from '../../lib/cn.helper';
import { FormFieldContext, getFieldAria, type IFormFieldContext } from './form-field-context';

const nativeControls = new Set<unknown>(['input', 'textarea', 'select']);

export interface IFormFieldProps {
  /** 보이는 레이블. 입력의 접근성 이름이 된다. */
  label: string;
  children: ReactNode;
  /** 입력 아래 도움말. 입력의 aria-describedby로 연결한다. */
  description?: ReactNode;
  /** 있으면 오류로 표시하고 읽어 준다(react-hook-form의 errors.x?.message). */
  error?: string;
  /** 레이블 옆의 필수/선택 등 보조 표시. 접근성 이름에는 들어가지 않으며 문구는 소비 앱이 제공한다. */
  labelSuffix?: ReactNode;
  className?: string;
}

/**
 * native label 안에서 입력·도움말·오류를 연결한다. TextField·TextAreaField도 이 필드로 조립한다.
 * Input·Textarea·NativeSelect는 위치와 관계없이 context로 연결하고, context를 읽지 못하는 native 요소는 직접 자식일 때 연결한다.
 */
export function FormField({ label, children, description, error, labelSuffix, className }: IFormFieldProps) {
  const id = useId();
  const hasDescription = Boolean(description);
  const invalid = Boolean(error);
  const field = useMemo<IFormFieldContext>(
    () => ({
      labelId: `${id}-label`,
      descriptionId: hasDescription ? `${id}-description` : undefined,
      errorId: invalid ? `${id}-error` : undefined,
      invalid,
    }),
    [id, hasDescription, invalid],
  );
  const controls = Children.map(children, (child) => {
    if (!isValidElement<AriaAttributes & { type?: string }>(child)) return child;
    if (!nativeControls.has(child.type) || child.props.type === 'hidden') return child;
    return cloneElement(child, getFieldAria(field, child.props));
  });
  const labelText = <span id={field.labelId}>{label}</span>;

  return (
    <FormFieldContext.Provider value={field}>
      <label className={cn('flex flex-col gap-1.5 text-label text-ink', className)}>
        {labelSuffix ? (
          <span className="flex items-center gap-1">
            {labelText}
            {labelSuffix}
          </span>
        ) : (
          labelText
        )}
        {controls}
        {description ? (
          <small id={field.descriptionId} className="text-caption text-muted">
            {description}
          </small>
        ) : null}
        {error ? (
          <small id={field.errorId} role="alert" className="text-caption text-danger">
            {error}
          </small>
        ) : null}
      </label>
    </FormFieldContext.Provider>
  );
}
