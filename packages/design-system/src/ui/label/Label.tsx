// Adapted from shadcn/ui base-nova. See SHADCN.md for source and license.
'use client';

import type { ComponentProps } from 'react';

import { cn } from '../../lib/cn.helper';

function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control -- 범용 프리미티브라 htmlFor와 이름은 props로 받고, 사용하는 곳은 labelComponents 옵션으로 검사한다.
    <label
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
