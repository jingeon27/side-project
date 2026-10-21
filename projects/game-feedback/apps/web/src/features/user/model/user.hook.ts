'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useNotify } from '@/shared/ui';

import { unblockUserMutationOptions } from './user.mutation-options';

export function useUnblockUser() {
  const client = useQueryClient();
  const notify = useNotify();
  return useMutation(unblockUserMutationOptions(client, notify));
}
