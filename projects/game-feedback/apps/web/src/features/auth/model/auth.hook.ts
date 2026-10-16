'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotify } from '@/shared/ui';
import { requestNativeLogin } from '@/shared/native';
import {
  fetchSession,
  postAppExchange,
  deleteMembership,
  postDemoLogin,
  postLogout,
  postOnboarding,
  postTestLogin,
} from '../api/auth.api';
import { clearAuthenticatedSession, replaceSession, refreshSession } from './session-cache';

export function useDemoLogin() {
  const client = useQueryClient();
  const notify = useNotify();
  return useMutation({
    mutationFn: postDemoLogin,
    onSuccess: async (session) => {
      await replaceSession(client, session);
      notify('반가워요! 함께 플레이를 나눠봐요.');
    },
  });
}
export function useCompleteOnboarding() {
  const client = useQueryClient();
  const notify = useNotify();
  return useMutation({
    mutationFn: postOnboarding,
    onSuccess: async (session) => {
      await replaceSession(client, session);
      notify('반가워요! 함께 플레이를 나눠봐요.');
    },
  });
}
export function useTestAccountLogin() {
  const client = useQueryClient();
  const notify = useNotify();
  return useMutation({
    mutationFn: postTestLogin,
    onSuccess: async (session) => {
      await replaceSession(client, session);
      notify(`${session.user?.nickname ?? '테스트 계정'} 계정으로 시작했어요.`);
    },
  });
}
export function useLogout() {
  const client = useQueryClient();
  const notify = useNotify();
  return useMutation({
    mutationFn: postLogout,
    onSuccess: async () => {
      await clearAuthenticatedSession(client);
      notify('로그아웃했어요. 다음 플레이에서 만나요!');
    },
  });
}
export function useDeleteAccount() {
  const client = useQueryClient();
  const notify = useNotify();
  return useMutation({
    mutationFn: deleteMembership,
    onSuccess: async () => {
      await clearAuthenticatedSession(client);
      notify('회원 탈퇴가 완료되었어요.');
    },
  });
}

export function useNativeLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const ticket = await requestNativeLogin();
      return ticket ? postAppExchange(ticket) : null;
    },
    onSuccess: async (session) => {
      if (session) await replaceSession(client, session);
    },
  });
}

export function useRefreshSession() {
  const client = useQueryClient();
  return useMutation({ mutationFn: () => refreshSession(client, fetchSession) });
}
