import { RotateCw } from 'lucide-react';

import { StatusAnimation } from '@side/design-system';

import { cn } from '../../../lib/cn.helper';
import { Button } from '../button';

interface IErrorStateProps {
  title?: string;
  /** getErrorMessage(error) 결과처럼 사람이 읽을 안내문 */
  message?: string;
  /** 있으면 "다시 시도" 버튼을 보여 준다(쿼리의 refetch 등). */
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = '불러오지 못했어요',
  message,
  onRetry,
  retryLabel = '다시 시도',
  className,
}: IErrorStateProps) {
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-2 px-6 py-12 text-center', className)}>
      <StatusAnimation variant="error" className="mb-2 size-16 text-danger" />
      <p className="text-subtitle text-ink">{title}</p>
      {message ? <p className="text-body text-muted">{message}</p> : null}
      {onRetry ? (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          <RotateCw aria-hidden className="size-4" />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
