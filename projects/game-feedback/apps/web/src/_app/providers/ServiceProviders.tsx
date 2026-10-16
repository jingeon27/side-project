import type { ReactNode } from 'react';
import { getServerSession } from '@/features/auth/index.server';
import { ServiceErrorBoundary } from '@/shared/ui';
import { Providers } from './Providers';
async function SessionProviders({ children }: { children: ReactNode }) {
  const initialSession = await getServerSession();
  return <Providers initialSession={initialSession}>{children}</Providers>;
}
export function ServiceProviders({ children }: { children: ReactNode }) {
  return (
    <ServiceErrorBoundary title="서비스 연결" refreshOnRetry>
      <SessionProviders>{children}</SessionProviders>
    </ServiceErrorBoundary>
  );
}
