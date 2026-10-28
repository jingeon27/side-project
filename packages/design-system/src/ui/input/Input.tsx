// Adapted from shadcn/ui base-nova. See SHADCN.md for source and license.
'use client';

import type { ComponentProps } from 'react';

import { Input as InputPrimitive } from '@base-ui/react/input';

import { cn } from '../../lib/cn.helper';
import { useFormFieldAria } from '../form-field/form-field-context';
import { inputControlClassName } from './input.styles';

function Input({ className, type, ...props }: ComponentProps<'input'>) {
  const fieldAria = useFormFieldAria(props);
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        inputControlClassName,
        'h-12 py-2 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-label file:text-ink disabled:pointer-events-none',
        className,
      )}
      {...props}
      {...fieldAria}
    />
  );
}

export { Input };
