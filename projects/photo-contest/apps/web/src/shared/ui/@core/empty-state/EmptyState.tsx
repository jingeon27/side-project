import type { ReactNode } from 'react';

import { StatusAnimation } from '@side/design-system';

import { cn } from '../../../lib/cn.helper';

interface IEmptyStateProps {
  title: string;
  description?: string;
  /** 모션을 줄이거나 플레이어가 준비되기 전 사용할 정지 그림 */
  icon?: ReactNode;
  /** 다음 행동(버튼·링크) */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: IEmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-12 text-center', className)}>
      <StatusAnimation variant="empty" fallback={icon} className="mb-2 size-16" />
      <p className="text-subtitle text-ink">{title}</p>
      {description ? <p className="text-body text-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
