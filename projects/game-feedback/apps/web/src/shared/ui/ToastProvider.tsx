'use client';
import { useI18n } from '@/shared/i18n';
import { IconButton } from '@side/design-system';
import { Check, X } from 'lucide-react';
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { AnimatePresence, m, useIsPresent, useMotionPreference } from '@/shared/motion';

const NotifyContext = createContext<(text: string) => void>(() => {});
export function useNotify() {
  return useContext(NotifyContext);
}
export function ToastProvider({ children }: { children: ReactNode }) {
  const [{ message, sequence }, setToast] = useState({ message: '', sequence: 0 });
  const handleNotify = useCallback((text: string) => {
    setToast((current) => ({ message: text, sequence: current.sequence + 1 }));
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      setToast((current) => (current.sequence === sequence ? { ...current, message: '' } : current));
    }, 4500);
    return () => clearTimeout(timer);
  }, [message, sequence]);
  const handleDismiss = useCallback(() => {
    setToast((current) => ({ ...current, message: '' }));
  }, []);
  return (
    <NotifyContext.Provider value={handleNotify}>
      {children}
      <AnimatePresence mode="wait">
        {message && <ToastMessage key={sequence} message={message} onDismiss={handleDismiss} />}
      </AnimatePresence>
    </NotifyContext.Provider>
  );
}

function ToastMessage({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const { t } = useI18n();
  const present = useIsPresent();
  const reducedMotion = useMotionPreference();
  return (
    <m.div
      className="toast"
      role={present ? 'status' : undefined}
      aria-hidden={!present || undefined}
      inert={!present}
      style={{ x: '-50%' }}
      initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reducedMotion ? 0 : 4 }}
    >
      <Check size={18} />
      {t(message)}
      <IconButton
        className="icon-button text-on-brand hover:bg-brand-strong"
        label={t('알림 닫기')}
        onClick={onDismiss}
      >
        <X size={16} />
      </IconButton>
    </m.div>
  );
}
