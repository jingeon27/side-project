'use client';

import { OverlayProvider } from 'overlay-kit';
import type { ReactNode } from 'react';

import { AuthSessionSync } from '@/features/auth';
import { ToastProvider } from '@/shared/ui/@core/toast';

import { AnalyticsTracker } from './analytics/AnalyticsTracker';
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
            {/* 분석 초기화가 로그인 사용자 설정(AuthSessionSync)보다 먼저 돌도록 앞에 둔다. */}
            <AnalyticsTracker />
            <AuthSessionSync />
            {children}
          </OverlayProvider>
        </ToastProvider>
      </BridgeProvider>
    </AppApolloProvider>
  );
}
