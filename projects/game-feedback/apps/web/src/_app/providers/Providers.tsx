'use client';
import { useI18n } from '@/shared/i18n';
import { Suspense, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OverlayProvider } from 'overlay-kit';
import { SessionProvider, sessionOptions, useSession } from '@/features/auth';
import { AuthOnboarding, openLoginDialog } from '@/widgets/authentication';
import { ChatRealtimeProvider } from '@/widgets/chat-realtime';
import type { Session } from '@/shared/api';
import { NativeBridge } from './NativeBridge';
import { NavigationHistory } from './NavigationHistory';
import { MobileViewport } from './MobileViewport';
import { ServiceErrorBoundary, ToastProvider } from '@/shared/ui';
import { MotionProvider } from '@/shared/motion';

export function Providers({ children, initialSession }: { children: ReactNode; initialSession?: Session }) {
  const { t } = useI18n();
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
            <SessionProvider onLogin={openLoginDialog}>
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
      <ChatRealtimeProvider userId={session?.user?.id}>{children}</ChatRealtimeProvider>
      <ServiceErrorBoundary title={t('앱 연결')}>
        <Suspense fallback={null}>
          <NativeBridge />
        </Suspense>
      </ServiceErrorBoundary>
      <ServiceErrorBoundary title={t('회원가입 안내')}>
        <AuthOnboarding />
      </ServiceErrorBoundary>
    </OverlayProvider>
  );
}
