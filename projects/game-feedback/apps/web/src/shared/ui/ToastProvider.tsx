'use client';
import { IconButton } from '@side/design-system';
import { Check, X } from 'lucide-react';
import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';

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
      {message && (
        <div className="toast" role="status">
          <Check size={18} />
          {message}
          <IconButton
            className="icon-button text-on-brand hover:bg-brand-strong"
            label="알림 닫기"
            onClick={handleDismiss}
          >
            <X size={16} />
          </IconButton>
        </div>
      )}
    </NotifyContext.Provider>
  );
}
