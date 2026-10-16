'use client';
import { Button, cn } from '@side/design-system';

interface IErrorRecoveryProps {
  title: string;
  onRetry: () => void;
  pending?: boolean;
  className?: string;
}

export function ErrorRecovery({ title, onRetry, pending = false, className }: IErrorRecoveryProps) {
  return (
    <section
      className={cn('error-recovery', className)}
      role="alert"
      aria-label={`${title} 오류`}
      aria-busy={pending}
    >
      <h2>{title}에 문제가 생겼어요</h2>
      <p>잠시 후 이 영역을 다시 시도해 주세요.</p>
      <Button variant="secondary" size="md" type="button" disabled={pending} onClick={onRetry}>
        {pending ? '다시 불러오는 중…' : '다시 시도하기'}
      </Button>
    </section>
  );
}
