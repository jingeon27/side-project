'use client';

import { Children, cloneElement, isValidElement, useId } from 'react';
import type { AriaAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn.helper';
import { Input } from '../input/Input';
import { Textarea } from '../textarea/Textarea';
import { NativeSelect } from '../native-select/NativeSelect';

const fieldControls = new Set<unknown>(['input', 'textarea', 'select', Input, Textarea, NativeSelect]);

export interface IFormFieldProps {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  error?: string;
  className?: string;
}

/** 기존 native label 폼을 유지하면서 입력·도움말·오류를 연결한다. */
export function FormField({ label, children, hint, error, className }: IFormFieldProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const controls = Children.map(children, (child) => {
    if (!isValidElement<AriaAttributes>(child)) return child;
    if (!fieldControls.has(child.type)) return child;
    const describedBy = [child.props['aria-describedby'], hint && hintId, error && errorId]
      .filter(Boolean)
      .join(' ');
    return cloneElement(child, {
      'aria-labelledby': child.props['aria-label'] ? child.props['aria-labelledby'] : labelId,
      'aria-describedby': describedBy || undefined,
      'aria-invalid': error ? true : child.props['aria-invalid'],
    });
  });

  return (
    <label className={cn('ds-form-field flex flex-col gap-1.5 text-label text-ink', className)}>
      <span id={labelId}>{label}</span>
      {controls}
      {hint ? (
        <small id={hintId} className="text-caption text-muted">
          {hint}
        </small>
      ) : null}
      {error ? (
        <small id={errorId} role="alert" className="text-caption text-danger">
          {error}
        </small>
      ) : null}
    </label>
  );
}
