import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import type { TLoginProvider } from '@game-feedback/bridge';

import { ApiError, type Session } from '@/shared/api';
import { requestNativeLogin } from '@/shared/native';

import {
  deleteMembership,
  fetchSession,
  postAppExchange,
  postDemoLogin,
  postLogout,
  postOnboarding,
  postTestLogin,
} from '../api/auth.api';
import { clearAuthenticatedSession, refreshSession, replaceSession } from './session-cache';

/**
 * 계정 전환 뒤 실행할 호출부의 후속 처리(번역한 알림 등).
 * 세션을 바꾸면 OverlayProvider가 다시 마운트되어 `mutate`의 콜백이 사라지므로 options의 onSuccess에서 부른다.
 */
type TAfterSuccess<TData = unknown> = (data: TData) => void;

export function demoLoginMutationOptions(client: QueryClient, afterSuccess?: TAfterSuccess<Session>) {
  return mutationOptions({
    mutationKey: ['auth', 'demo-login'],
    mutationFn: postDemoLogin,
    onSuccess: async (session) => {
      await replaceSession(client, session);
      afterSuccess?.(session);
    },
  });
}

export function completeOnboardingMutationOptions(
  client: QueryClient,
  afterSuccess?: TAfterSuccess<Session>,
) {
  return mutationOptions({
    mutationKey: ['auth', 'complete-onboarding'],
    mutationFn: postOnboarding,
    onError: async (error) => {
      if (error instanceof ApiError && error.errorCode === 'AUTH_REQUIRED')
        await clearAuthenticatedSession(client);
    },
    onSuccess: async (session) => {
      await replaceSession(client, session);
      afterSuccess?.(session);
    },
  });
}

export function testAccountLoginMutationOptions(client: QueryClient, afterSuccess?: TAfterSuccess<Session>) {
  return mutationOptions({
    mutationKey: ['auth', 'test-account-login'],
    mutationFn: postTestLogin,
    onSuccess: async (session) => {
      await replaceSession(client, session);
      afterSuccess?.(session);
    },
  });
}

export function logoutMutationOptions(client: QueryClient, afterSuccess?: TAfterSuccess) {
  return mutationOptions({
    mutationKey: ['auth', 'logout'],
    mutationFn: postLogout,
    onSuccess: async (result) => {
      await clearAuthenticatedSession(client);
      afterSuccess?.(result);
    },
  });
}

export function deleteAccountMutationOptions(client: QueryClient, afterSuccess?: TAfterSuccess) {
  return mutationOptions({
    mutationKey: ['auth', 'delete-account'],
    mutationFn: deleteMembership,
    onSuccess: async (result) => {
      await clearAuthenticatedSession(client);
      afterSuccess?.(result);
    },
  });
}

export function nativeLoginMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['auth', 'native-login'],
    mutationFn: async (provider: TLoginProvider = 'google') => {
      const ticket = await requestNativeLogin(provider);
      return ticket ? postAppExchange(ticket) : null;
    },
    onSuccess: async (session) => {
      if (session) await replaceSession(client, session);
    },
  });
}

export function refreshSessionMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['auth', 'refresh-session'],
    mutationFn: () => refreshSession(client, fetchSession),
  });
}
