import { useMutation, useQueryClient } from '@tanstack/react-query';

import { loginMutationOptions, logoutMutationOptions } from './auth.mutation-options';

export function useLoginMutation() {
  const client = useQueryClient();
  return useMutation(loginMutationOptions(client));
}

export function useLogoutMutation() {
  const client = useQueryClient();
  return useMutation(logoutMutationOptions(client));
}
