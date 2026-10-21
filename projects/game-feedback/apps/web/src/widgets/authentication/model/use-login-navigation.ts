'use client';
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';
import { useI18n } from '@/shared/i18n';
import { isNativeApp } from '@/shared/native';
import { trackEvent, ANALYTICS_EVENT } from '@/shared/analytics';
import { openLoginDialog } from './login.overlay';

export function useLoginNavigation() {
  const router = useRouter();
  const { locale } = useI18n();
  return useCallback(() => {
    const route = resolveAppRoute(window.location.pathname + window.location.search);
    if (route?.screen === 'login') return;
    trackEvent(ANALYTICS_EVENT.LoginOpened, {});
    if (isNativeApp() || window.matchMedia('(max-width: 760px)').matches) {
      router.push(appRoutes.login(locale, route?.path ?? appRoutes.feed(locale)));
      return;
    }
    openLoginDialog(route?.path ?? appRoutes.feed(locale));
  }, [router, locale]);
}
