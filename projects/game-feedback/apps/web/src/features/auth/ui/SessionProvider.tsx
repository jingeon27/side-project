'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { Session } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useNotify } from '@/shared/ui';

import { sessionOptions } from '../model/auth.options';

interface ISessionContext {
  session: Session;
  loading: boolean;
  login: () => void;
  notify: (text: string) => void;
}
interface ISessionProviderProps {
  children: ReactNode;
  onLogin: () => void;
}
const SessionContext = createContext<ISessionContext | undefined>(undefined);

export function useSession() {
  const { t } = useI18n();
  const context = useContext(SessionContext);
  if (!context) throw new Error(t('SessionProvider가 필요합니다.'));
  return context;
}
export function SessionProvider({ children, onLogin }: ISessionProviderProps) {
  const {
    data: session,
    error,
    isFetching,
  } = useSuspenseQuery({ ...sessionOptions(), refetchOnMount: 'always' });
  const notify = useNotify();
  if (error && !isFetching) throw error;
  return (
    <SessionContext.Provider value={{ session, loading: false, login: onLogin, notify }}>
      {children}
    </SessionContext.Provider>
  );
}
