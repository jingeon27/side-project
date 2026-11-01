import type { ComponentProps } from 'react';

import { cn } from '../../lib/cn.helper';

export interface IFormActionsProps extends ComponentProps<'div'> {
  contentClassName?: string;
}

export function FormActions({ children, className, contentClassName, ...props }: IFormActionsProps) {
  return (
    <div
      {...props}
      data-sticky-cta
      className={cn(
        'sticky bottom-0 z-sticky-cta mt-auto shrink-0 border-t border-line bg-surface px-4 pt-3 pb-[calc(16px+var(--safe-bottom,env(safe-area-inset-bottom,0px)))]',
        className,
      )}
    >
      <div className={cn('mx-auto w-full max-w-app', contentClassName)}>{children}</div>
    </div>
  );
}
