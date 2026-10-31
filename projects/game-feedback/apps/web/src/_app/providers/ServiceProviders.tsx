'use client';

import { useState, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OverlayProvider } from 'overlay-kit';

import { VisualViewport } from '@side/design-system';

import { sessionOptions, SessionProvider, useSession } from '@/features/auth';
import { categoryOptions } from '@/features/category';
import { AnalyticsIdentity, InteractionTracker } from '@/shared/analytics';
import { LanguageProvider, translate, useI18n, type TLocale } from '@/shared/i18n';
import { MotionProvider } from '@/shared/motion';
import { NavigationGuardProvider } from '@/shared/navigation';
import { ThemeProvider } from '@/shared/theme';
import { AsyncBoundary, ServiceErrorBoundary, ToastProvider } from '@/shared/ui';
import { AuthOnboarding, useLoginNavigation } from '@/widgets/authentication';
import { ChatRealtimeProvider } from '@/widgets/chat-realtime';

import { NativeBridge } from './NativeBridge';
import { NativePushSync } from './NativePushSync';
import type { serviceContext } from './service-context.server';

type TServiceContext = Awaited<ReturnType<typeof serviceContext>>;

export function ServiceProviders({
  children,
  locale,
  context,
}: {
  children: ReactNode;
  locale: TLocale;
  context: TServiceContext;
}) {
  return (
    <ServiceErrorBoundary title={translate(locale, '서비스 연결')} refreshOnRetry>
      <LanguageProvider
        initialLocale={locale}
        initialPreference={context.language}
        automaticLocale={context.automaticLocale}
      >
        <ThemeProvider initialPreference={context.theme}>
          <ServiceRuntime context={context}>{children}</ServiceRuntime>
        </ThemeProvider>
      </LanguageProvider>
    </ServiceErrorBoundary>
  );
}

function ServiceRuntime({ children, context }: { children: ReactNode; context: TServiceContext }) {
  const { t } = useI18n();
  const handleLogin = useLoginNavigation();
  const [client] = useState(() => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
    });
    if (context.initialSession) queryClient.setQueryData(sessionOptions().queryKey, context.initialSession);
    queryClient.setQueryData(categoryOptions().queryKey, context.initialCategories);
    return queryClient;
  });
  return (
    <QueryClientProvider client={client}>
      <ServiceErrorBoundary title={t('서비스 연결')}>
        <NavigationGuardProvider>
          <MotionProvider>
            <VisualViewport />
            <ToastProvider>
              <SessionProvider onLogin={handleLogin}>
                <SessionContent>{children}</SessionContent>
              </SessionProvider>
            </ToastProvider>
          </MotionProvider>
        </NavigationGuardProvider>
      </ServiceErrorBoundary>
    </QueryClientProvider>
  );
}

function SessionContent({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { session } = useSession();
  return (
    <OverlayProvider key={session?.user?.id ?? 'anonymous'}>
      <AnalyticsIdentity userId={session.user?.id} needsOnboarding={session.needsOnboarding} />
      <InteractionTracker />
      <NativePushSync />
      <ChatRealtimeProvider userId={session?.user?.id}>{children}</ChatRealtimeProvider>
      <AsyncBoundary title={t('앱 연결')} pendingFallback={null}>
        <NativeBridge />
      </AsyncBoundary>
      <AsyncBoundary title={t('회원가입 안내')} pendingFallback={null}>
        <AuthOnboarding />
      </AsyncBoundary>
    </OverlayProvider>
  );
}
