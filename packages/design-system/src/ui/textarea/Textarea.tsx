// Adapted from shadcn/ui base-nova. See SHADCN.md for source and license.
'use client';

import type { ComponentProps } from 'react';

import { cn } from '../../lib/cn.helper';
import { useFormFieldAria } from '../form-field/form-field-context';

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  const fieldAria = useFormFieldAria(props);
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-lg border border-input-border bg-transparent px-3 py-3 text-input transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
      {...fieldAria}
    />
  );
}

export { Textarea };
