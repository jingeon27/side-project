'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { OverlayProvider } from 'overlay-kit';

import { VisualViewport } from '@side/design-system';

import { AuthSessionSync } from '@/features/auth';
import { PUBLIC_LANDING_PATHS } from '@/shared/constants/routes';
import { NativeThemeSync, ThemeProvider, type TThemePreference } from '@/shared/model/theme';
import { ToastProvider } from '@/shared/ui/@core/toast';

import { AnalyticsTracker } from './analytics/AnalyticsTracker';
import { AppApolloProvider } from './apollo/AppApolloProvider';
import { BridgeProvider } from './bridge/BridgeProvider';
import { HydrationMarker } from './HydrationMarker';
import { NativePushSync } from './NativePushSync';
import { RouteHistoryTracker } from './navigation/RouteHistoryTracker';

function SessionSync() {
  const pathname = usePathname();
  if (PUBLIC_LANDING_PATHS.some((path) => path === pathname)) return null;
  return (
    <>
      <AuthSessionSync />
      <NativePushSync />
    </>
  );
}

/** 루트 레이아웃이 감싸는 Provider. 시트·대화상자는 Apollo·브리지·토스트를 모두 쓰므로 OverlayProvider가 가장 안쪽이다. */
export function AppProviders({
  children,
  themePreference = 'system',
}: {
  children: ReactNode;
  themePreference?: TThemePreference;
}) {
  return (
    <ThemeProvider initialPreference={themePreference}>
      <AppApolloProvider>
        <BridgeProvider>
          <NativeThemeSync />
          <ToastProvider>
            <OverlayProvider>
              <HydrationMarker />
              <VisualViewport />
              <RouteHistoryTracker />
              {/* 분석 초기화가 로그인 사용자 설정(AuthSessionSync)보다 먼저 돌도록 앞에 둔다. */}
              <AnalyticsTracker />
              <SessionSync />
              {children}
            </OverlayProvider>
          </ToastProvider>
        </BridgeProvider>
      </AppApolloProvider>
    </ThemeProvider>
  );
}
