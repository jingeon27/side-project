'use client';

import { captureException } from '@sentry/nextjs';
import { useEffect } from 'react';

import '@/_app/styles/tailwind.css';
import { ErrorState } from '@/shared/ui/@core/error-state';

/** 루트 레이아웃까지 실패했을 때. 레이아웃을 대신하므로 html·body와 스타일을 직접 둔다. */
export default function GlobalError({
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
    <html lang="ko">
      <body>
        <title>웃긴순간</title>
        <div className="flex min-h-dvh justify-center bg-canvas">
          <main className="flex min-h-dvh w-full max-w-app flex-col justify-center bg-surface shadow-app">
            <ErrorState
              title="화면을 불러오지 못했어요"
              message="잠시 후 다시 시도해 주세요."
              onRetry={retry}
            />
          </main>
        </div>
      </body>
    </html>
  );
}
