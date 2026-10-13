'use client';
import { useEffect } from 'react';
import { captureException } from '@sentry/browser';
import { ErrorNotice } from '@/shared/ui/states';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    captureException(error);
  }, [error]);
  return <ErrorNotice message="화면을 불러오지 못했습니다." retry={reset} />;
}
