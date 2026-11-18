// Adapted from shadcn/ui base-nova. See SHADCN.md for source and license.
'use client';

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { CheckIcon, MinusIcon } from 'lucide-react';

import { cn } from '../../lib/cn.helper';
import type { TStyledProps } from '../../lib/styled-props';

/** 보이는 상자와 별도로 가운데에 44×44px의 터치 영역을 둔다. */
function Checkbox({ className, ...props }: TStyledProps<CheckboxPrimitive.Root.Props>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer relative inline-flex size-5 shrink-0 items-center justify-center rounded-badge border border-control-border bg-surface motion-safe:transition-colors after:absolute after:top-1/2 after:left-1/2 after:size-touch after:-translate-1/2',
        'data-checked:border-brand data-checked:bg-brand data-checked:text-on-brand data-indeterminate:border-brand data-indeterminate:bg-brand data-indeterminate:text-on-brand data-disabled:cursor-not-allowed data-disabled:opacity-45 aria-invalid:border-danger aria-invalid:inset-ring-1 aria-invalid:inset-ring-danger',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current"
        render={(indicatorProps, state) => {
          const Mark = state.indeterminate ? MinusIcon : CheckIcon;
          return (
            <span {...indicatorProps}>
              <Mark aria-hidden="true" size={14} strokeWidth={2.75} />
            </span>
          );
        }}
      />
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
