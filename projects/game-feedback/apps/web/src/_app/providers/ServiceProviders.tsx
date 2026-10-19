import type { ReactNode } from 'react';
import { ServiceErrorBoundary } from '@/shared/ui';
import { LanguageProvider, type TLocale } from '@/shared/i18n';
import { ThemeProvider } from '@/shared/theme';
import { Providers } from './Providers';
import type { serviceContext } from './service-context.server';

export function ServiceProviders({
  children,
  locale,
  context,
}: {
  children: ReactNode;
  locale: TLocale;
  context: Awaited<ReturnType<typeof serviceContext>>;
}) {
  return (
    <ServiceErrorBoundary title="서비스 연결" refreshOnRetry>
      <LanguageProvider
        initialLocale={locale}
        initialPreference={context.language}
        automaticLocale={context.automaticLocale}
      >
        <ThemeProvider initialPreference={context.theme}>
          <Providers initialSession={context.initialSession}>{children}</Providers>
        </ThemeProvider>
      </LanguageProvider>
    </ServiceErrorBoundary>
  );
}
