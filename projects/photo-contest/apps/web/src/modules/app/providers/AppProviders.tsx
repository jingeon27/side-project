'use client';

import { OverlayProvider } from 'overlay-kit';
import type { ReactNode } from 'react';

import { ToastProvider } from '@/modules/shared/ui/@core/toast';

import { AppApolloProvider } from './apollo/AppApolloProvider';
import { BridgeProvider } from './bridge/BridgeProvider';
import { RouteHistoryTracker } from './navigation/RouteHistoryTracker';

/** 루트 레이아웃이 감싸는 Provider. 시트·대화상자는 Apollo·브리지·토스트를 모두 쓰므로 OverlayProvider가 가장 안쪽이다. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppApolloProvider>
      <BridgeProvider>
        <ToastProvider>
          <OverlayProvider>
            <RouteHistoryTracker />
            {children}
          </OverlayProvider>
        </ToastProvider>
      </BridgeProvider>
    </AppApolloProvider>
  );
}
