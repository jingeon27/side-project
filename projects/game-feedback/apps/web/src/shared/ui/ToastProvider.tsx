'use client';

import { createContext, useContext, useCallback, Suspense, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Toaster, toast } from '@side/design-system';
import { resolveAppRoute } from '@game-feedback/bridge';
import { useI18n, translate } from '@/shared/i18n';
import { useThemePreference } from '@/shared/theme';

const toasterId = 'game-feedback';
const NotifyContext = createContext<(text: string) => void>(() => {});

export function useNotify() {
  return useContext(NotifyContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const handleNotify = useCallback(
    (text: string) => {
      toast(translate(locale, text), { id: 'game-feedback-notice', toasterId });
    },
    [locale],
  );
  return (
    <NotifyContext.Provider value={handleNotify}>
      {children}
      <Suspense fallback={null}>
        <ServiceToaster />
      </Suspense>
    </NotifyContext.Provider>
  );
}

function ServiceToaster() {
  const { t } = useI18n();
  const theme = useThemePreference();
  const pathname = usePathname();
  const conversation = resolveAppRoute(pathname)?.screen === 'conversation';
  const offset = conversation
    ? { top: 'var(--service-toast-top)' }
    : { bottom: 'var(--service-toast-bottom)' };
  return (
    <Toaster
      id={toasterId}
      theme={theme}
      position={conversation ? 'top-center' : 'bottom-center'}
      duration={4500}
      visibleToasts={1}
      closeButton
      customAriaLabel={t('알림')}
      className="service-toaster"
      offset={offset}
      mobileOffset={offset}
      toastOptions={{
        closeButtonAriaLabel: t('알림 닫기'),
      }}
    />
  );
}
