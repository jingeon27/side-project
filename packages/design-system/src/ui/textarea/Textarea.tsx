// Adapted from shadcn/ui base-nova. See SHADCN.md for source and license.
'use client';

import type { ComponentProps } from 'react';

import { cn } from '../../lib/cn.helper';
import { useFormFieldAria } from '../form-field/form-field-context';
import { inputControlClassName } from '../input/input.styles';

/** 기본은 내용에 맞춰 늘어나며 세로로만 크기를 바꾼다. 고정 줄 수가 필요하면 TextAreaField를 쓴다. */
function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  const fieldAria = useFormFieldAria(props);
  return (
    <textarea
      data-slot="textarea"
      className={cn(inputControlClassName, 'flex field-sizing-content min-h-16 resize-y py-3', className)}
      {...props}
      {...fieldAria}
    />
  );
}

export { Textarea };
