'use client';
import { ErrorRecovery } from '@/shared/ui';

export function RouteError({ retry }: { retry: () => void }) {
  return <ErrorRecovery title="이 화면" onRetry={retry} />;
}
