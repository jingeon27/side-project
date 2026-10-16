'use client';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OverlayProvider } from 'overlay-kit';
import { SessionProvider, useSession } from '@/features/auth';
import { AuthOnboarding, openLoginDialog } from '@/widgets/authentication';
import { ChatRealtimeProvider } from '@/widgets/chat-realtime';
import { NativeBridge } from './NativeBridge';
import { ServiceErrorBoundary, ToastProvider } from '@/shared/ui';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ServiceErrorBoundary title="서비스 연결">
        <ToastProvider>
          <SessionProvider onLogin={openLoginDialog}>
            <SessionContent>{children}</SessionContent>
          </SessionProvider>
        </ToastProvider>
      </ServiceErrorBoundary>
    </QueryClientProvider>
  );
}
function SessionContent({ children }: { children: ReactNode }) {
  const { session } = useSession();
  return (
    <OverlayProvider key={session?.user?.id ?? 'anonymous'}>
      <ChatRealtimeProvider userId={session?.user?.id}>{children}</ChatRealtimeProvider>
      <ServiceErrorBoundary title="앱 연결">
        <NativeBridge />
      </ServiceErrorBoundary>
      <ServiceErrorBoundary title="회원가입 안내">
        <AuthOnboarding />
      </ServiceErrorBoundary>
    </OverlayProvider>
  );
}
