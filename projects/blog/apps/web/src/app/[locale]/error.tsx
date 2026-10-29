'use client';

import { useEffect } from 'react';

import { useLocale } from 'next-intl';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useLocale();
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    const reportError = async () => {
      try {
        const Sentry = await import('@sentry/nextjs');
        Sentry.captureException(error);
      } catch {
        /* 선택적 모니터링 실패가 오류 화면을 방해하지 않게 한다. */
      }
    };
    void reportError();
  }, [error]);
  return (
    <main id="main-content" className="page-container" style={{ paddingBlock: '6rem' }}>
      <h1>{locale === 'ko' ? '글을 불러오지 못했습니다.' : 'Unable to load this page.'}</h1>
      <button type="button" onClick={reset}>
        {locale === 'ko' ? '다시 시도' : 'Try again'}
      </button>
    </main>
  );
}
