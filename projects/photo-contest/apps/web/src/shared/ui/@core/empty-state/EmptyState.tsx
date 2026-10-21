import type { ReactNode } from 'react';

import { Inbox } from 'lucide-react';

import { cn } from '../../../lib/cn.helper';

interface IEmptyStateProps {
  title: string;
  description?: string;
  /** 기본은 빈 상자 아이콘 */
  icon?: ReactNode;
  /** 다음 행동(버튼·링크) */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: IEmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-12 text-center', className)}>
      <span
        aria-hidden
        className="mb-1 flex size-14 items-center justify-center rounded-full bg-sunken text-muted"
      >
        {icon ?? <Inbox className="size-6" />}
      </span>
      <p className="text-subtitle text-ink">{title}</p>
      {description ? <p className="text-body text-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
