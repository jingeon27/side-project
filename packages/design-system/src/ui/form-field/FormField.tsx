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
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  error?: string;
  className?: string;
}

/**
 * 기존 native label 폼을 유지하면서 입력·도움말·오류를 연결한다.
 * Input·Textarea·NativeSelect는 위치와 관계없이 context로 연결하고, context를 읽지 못하는 native 요소는 직접 자식일 때 연결한다.
 */
export function FormField({ label, children, hint, error, className }: IFormFieldProps) {
  const id = useId();
  const hasHint = Boolean(hint);
  const invalid = Boolean(error);
  const field = useMemo<IFormFieldContext>(
    () => ({
      labelId: `${id}-label`,
      hintId: hasHint ? `${id}-hint` : undefined,
      errorId: invalid ? `${id}-error` : undefined,
      invalid,
    }),
    [id, hasHint, invalid],
  );
  const controls = Children.map(children, (child) => {
    if (!isValidElement<AriaAttributes & { type?: string }>(child)) return child;
    if (!nativeControls.has(child.type) || child.props.type === 'hidden') return child;
    return cloneElement(child, getFieldAria(field, child.props));
  });

  return (
    <FormFieldContext.Provider value={field}>
      <label className={cn('ds-form-field flex flex-col gap-1.5 text-label text-ink', className)}>
        <span id={field.labelId}>{label}</span>
        {controls}
        {hint ? (
          <small id={field.hintId} className="text-caption text-muted">
            {hint}
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
