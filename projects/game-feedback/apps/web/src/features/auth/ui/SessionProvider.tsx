'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Session } from '@/shared/api';
import { useNotify } from '@/shared/ui';
import { sessionOptions } from '../model/auth.options';

interface ISessionContext {
  session: Session | undefined;
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
  const context = useContext(SessionContext);
  if (!context) throw new Error('SessionProvider가 필요합니다.');
  return context;
}
export function SessionProvider({ children, onLogin }: ISessionProviderProps) {
  const { data: session, isPending } = useQuery({ ...sessionOptions(), refetchOnMount: 'always' });
  const notify = useNotify();
  return (
    <SessionContext.Provider value={{ session, loading: isPending, login: onLogin, notify }}>
      {children}
    </SessionContext.Provider>
  );
}
