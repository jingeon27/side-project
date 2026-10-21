import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import type { TLoginProvider } from '@game-feedback/bridge';

import { ApiError } from '@/shared/api';
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

export function demoLoginMutationOptions(client: QueryClient, notify: (text: string) => void) {
  return mutationOptions({
    mutationKey: ['auth', 'demo-login'],
    mutationFn: postDemoLogin,
    onSuccess: async (session) => {
      await replaceSession(client, session);
      notify('반가워요! 함께 플레이를 나눠봐요.');
    },
  });
}

export function completeOnboardingMutationOptions(client: QueryClient, notify: (text: string) => void) {
  return mutationOptions({
    mutationKey: ['auth', 'complete-onboarding'],
    mutationFn: postOnboarding,
    onError: async (error) => {
      if (error instanceof ApiError && error.errorCode === 'AUTH_REQUIRED')
        await clearAuthenticatedSession(client);
    },
    onSuccess: async (session) => {
      await replaceSession(client, session);
      notify('반가워요! 함께 플레이를 나눠봐요.');
    },
  });
}

export function testAccountLoginMutationOptions(client: QueryClient, notify: (text: string) => void) {
  return mutationOptions({
    mutationKey: ['auth', 'test-account-login'],
    mutationFn: postTestLogin,
    onSuccess: async (session) => {
      await replaceSession(client, session);
      notify(`${session.user?.nickname ?? '테스트 계정'} 계정으로 시작했어요.`);
    },
  });
}

export function logoutMutationOptions(client: QueryClient, notify: (text: string) => void) {
  return mutationOptions({
    mutationKey: ['auth', 'logout'],
    mutationFn: postLogout,
    onSuccess: async () => {
      await clearAuthenticatedSession(client);
      notify('로그아웃했어요. 다음 플레이에서 만나요!');
    },
  });
}

export function deleteAccountMutationOptions(client: QueryClient, notify: (text: string) => void) {
  return mutationOptions({
    mutationKey: ['auth', 'delete-account'],
    mutationFn: deleteMembership,
    onSuccess: async () => {
      await clearAuthenticatedSession(client);
      notify('회원 탈퇴가 완료되었어요.');
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
