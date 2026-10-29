'use client';

import { createContext, Suspense, useCallback, useContext, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { resolveAppRoute } from '@game-feedback/bridge';
import { toast, Toaster } from '@side/design-system';

import { useI18n } from '@/shared/i18n';
import { useThemePreference } from '@/shared/theme';

const toasterId = 'game-feedback';
const NotifyContext = createContext<(text: string) => void>(() => {});

/** 번역을 마친 문구를 알림으로 보인다. 문구 키는 호출부가 `t()`로 번역해서 넘긴다. */
export function useNotify() {
  return useContext(NotifyContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const notify = useCallback((text: string) => {
    toast(text, { id: 'game-feedback-notice', toasterId });
  }, []);
  return (
    <NotifyContext.Provider value={notify}>
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
