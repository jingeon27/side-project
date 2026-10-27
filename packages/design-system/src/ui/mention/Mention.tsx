import type { ComponentProps } from 'react';

import { cn } from '../../lib/cn.helper';

export interface IMentionProps extends Omit<ComponentProps<'span'>, 'className' | 'children'> {
  /** @ 뒤에 보여 줄 이름 */
  nickname: string;
  className?: string;
}

/** 본문 속 @멘션. native span props(id·title·aria-*·data-*·ref)는 그대로 전달한다. */
export function Mention({ nickname, className, ...props }: IMentionProps) {
  return (
    <span
      data-slot="mention"
      {...props}
      className={cn(
        'inline-flex max-w-full rounded-badge border border-line-strong bg-sunken px-1.5 text-caption font-medium text-ink wrap-anywhere',
        className,
      )}
    >
      @{nickname}
    </span>
  );
}
