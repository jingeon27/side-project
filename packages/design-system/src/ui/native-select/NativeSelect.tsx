// Adapted from shadcn/ui base-nova. See SHADCN.md for source and license.
'use client';

import type { ComponentProps } from 'react';

import { ChevronDownIcon } from 'lucide-react';

import { cn } from '../../lib/cn.helper';
import { useFormFieldAria } from '../form-field/form-field-context';
import { inputControlClassName } from '../input/input.styles';

type TNativeSelectProps = Omit<ComponentProps<'select'>, 'size'> & {
  size?: 'sm' | 'default';
};

/** FormField의 native label 안에 들어가므로 래퍼는 phrasing 요소(span)로 둔다. */
function NativeSelect({ className, size = 'default', ...props }: TNativeSelectProps) {
  const fieldAria = useFormFieldAria(props);
  return (
    <span
      className={cn('group/native-select relative block w-full', className)}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          inputControlClassName,
          'h-12 appearance-none py-2 pr-9 select-none disabled:pointer-events-none data-[size=sm]:h-touch data-[size=sm]:py-0.5',
        )}
        {...props}
        {...fieldAria}
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </span>
  );
}

function NativeSelectOption({ className, ...props }: ComponentProps<'option'>) {
  return (
    <option
      data-slot="native-select-option"
      className={cn('bg-[Canvas] text-[CanvasText]', className)}
      {...props}
    />
  );
}

function NativeSelectOptGroup({ className, ...props }: ComponentProps<'optgroup'>) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn('bg-[Canvas] text-[CanvasText]', className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
