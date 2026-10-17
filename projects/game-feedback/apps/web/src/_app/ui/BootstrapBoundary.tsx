'use client';
import { useState } from 'react';
import { catchError, type ErrorInfo } from 'next/error';
import { QueryClient, useMutation } from '@tanstack/react-query';
import { ErrorRecovery, errorRecoveryMutationOptions } from '@/shared/ui';
import { LanguageProvider, translate, type TLocale } from '@/shared/i18n';

function BootstrapFailure({ locale }: { locale: TLocale }, { retry }: ErrorInfo) {
  const [client] = useState(() => new QueryClient());
  const recovery = useMutation(errorRecoveryMutationOptions(), client);
  return (
    <html lang={locale} data-theme="system">
      <body>
        <LanguageProvider initialLocale={locale} initialPreference="auto" automaticLocale={locale}>
          <main className="standalone-state">
            <ErrorRecovery
              title={translate(locale, '서비스 연결')}
              pending={recovery.isPending}
              onRetry={() => recovery.mutate({ retry, reset: retry, refreshOnRetry: true })}
            />
          </main>
        </LanguageProvider>
      </body>
    </html>
  );
}
export const BootstrapBoundary = catchError(BootstrapFailure);
