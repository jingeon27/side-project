'use client';

import { captureException } from '@sentry/nextjs';
import { useEffect } from 'react';

import { ErrorState } from '@/shared/ui/@core/error-state';

export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col justify-center">
      <ErrorState title="화면을 불러오지 못했어요" message="잠시 후 다시 시도해 주세요." onRetry={retry} />
    </div>
  );
}
