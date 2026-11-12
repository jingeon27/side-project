'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { Session } from '@/shared/api';
import { openOverlay } from '@/shared/ui';

import { sessionOptions } from '../model/auth.options';
import { LoginRequiredDialog } from './LoginRequiredDialog';

interface ISessionContext {
  session: Session;
  login: () => void;
  requireLogin: () => void;
}
interface ISessionProviderProps {
  children: ReactNode;
  onLogin: () => void;
}
const SessionContext = createContext<ISessionContext | undefined>(undefined);

export function useSession() {
  const context = useContext(SessionContext);
  // 개발 중 provider 누락을 알리는 오류라 서비스 문구로 번역하지 않는다.
  if (!context) throw new Error('SessionProvider가 필요합니다.');
  return context;
}
export function SessionProvider({ children, onLogin }: ISessionProviderProps) {
  const {
    data: session,
    error,
    isFetching,
  } = useSuspenseQuery({ ...sessionOptions(), refetchOnMount: 'always' });
  // 세션은 Suspense로 받으므로 로딩 상태가 없다. 많은 화면이 구독하므로 세션이 바뀔 때만 새 값을 만든다.
  const value = useMemo<ISessionContext>(
    () => ({
      session,
      login: onLogin,
      requireLogin: () =>
        openOverlay(
          (control) => (
            <LoginRequiredDialog
              {...control}
              onLogin={() => {
                control.onOpenChange(false);
                onLogin();
              }}
            />
          ),
          { overlayId: 'login-required-dialog' },
        ),
    }),
    [session, onLogin],
  );
  if (error && !isFetching) throw error;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
