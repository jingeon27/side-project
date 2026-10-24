'use client';

import { useState, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OverlayProvider } from 'overlay-kit';

import { sessionOptions, SessionProvider, useSession } from '@/features/auth';
import { AnalyticsIdentity, InteractionTracker } from '@/shared/analytics';
import type { Session } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { MotionProvider } from '@/shared/motion';
import { AsyncBoundary, ServiceErrorBoundary, ToastProvider } from '@/shared/ui';
import { AuthOnboarding, useLoginNavigation } from '@/widgets/authentication';
import { ChatRealtimeProvider } from '@/widgets/chat-realtime';

import { MobileViewport } from './MobileViewport';
import { NativeBridge } from './NativeBridge';
import { NativePushSync } from './NativePushSync';
import { NavigationHistory } from './NavigationHistory';

export function Providers({ children, initialSession }: { children: ReactNode; initialSession?: Session }) {
  const { t } = useI18n();
  const handleLogin = useLoginNavigation();
  const [client] = useState(() => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
    });
    if (initialSession) queryClient.setQueryData(sessionOptions().queryKey, initialSession);
    return queryClient;
  });
  return (
    <QueryClientProvider client={client}>
      <ServiceErrorBoundary title={t('서비스 연결')}>
        <MotionProvider>
          <NavigationHistory />
          <MobileViewport />
          <ToastProvider>
            <SessionProvider onLogin={handleLogin}>
              <SessionContent>{children}</SessionContent>
            </SessionProvider>
          </ToastProvider>
        </MotionProvider>
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
