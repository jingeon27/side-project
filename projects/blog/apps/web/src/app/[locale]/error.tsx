'use client';

import { useEffect } from 'react';

import { useTranslations } from 'next-intl';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('error');
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
      <h1>{t('title')}</h1>
      <button type="button" onClick={reset}>
        {t('retry')}
      </button>
    </main>
  );
}
