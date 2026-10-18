'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotify } from '@/shared/ui';
import {
  demoLoginMutationOptions,
  completeOnboardingMutationOptions,
  testAccountLoginMutationOptions,
  logoutMutationOptions,
  deleteAccountMutationOptions,
  nativeLoginMutationOptions,
  refreshSessionMutationOptions,
} from './auth.mutation-options';

export function useDemoLogin() {
  const client = useQueryClient();
  const notify = useNotify();
  return useMutation(demoLoginMutationOptions(client, notify));
}

export function useCompleteOnboarding() {
  const client = useQueryClient();
  const notify = useNotify();
  return useMutation(completeOnboardingMutationOptions(client, notify));
}

export function useTestAccountLogin() {
  const client = useQueryClient();
  const notify = useNotify();
  return useMutation(testAccountLoginMutationOptions(client, notify));
}

export function useLogout() {
  const client = useQueryClient();
  const notify = useNotify();
  return useMutation(logoutMutationOptions(client, notify));
}

export function useDeleteAccount() {
  const client = useQueryClient();
  const notify = useNotify();
  return useMutation(deleteAccountMutationOptions(client, notify));
}

export function useNativeLogin() {
  const client = useQueryClient();
  return useMutation(nativeLoginMutationOptions(client));
}

export function useRefreshSession() {
  const client = useQueryClient();
  return useMutation(refreshSessionMutationOptions(client));
}
