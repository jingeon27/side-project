'use client';
import { useI18n } from '@/shared/i18n';
import { IconButton } from '@side/design-system';
import { Check, X } from 'lucide-react';
import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { AnimatePresence, m, useIsPresent, useMotionPreference } from '@/shared/motion';

const NotifyContext = createContext<(text: string) => void>(() => {});
export function useNotify() {
  return useContext(NotifyContext);
}
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleNotify = useCallback((text: string) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(''), 4500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  function handleDismiss() {
    clearTimeout(timer.current);
    setMessage('');
  }
  return (
    <NotifyContext.Provider value={handleNotify}>
      {children}
      <AnimatePresence mode="wait">
        {message && <ToastMessage key={message} message={message} onDismiss={handleDismiss} />}
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
