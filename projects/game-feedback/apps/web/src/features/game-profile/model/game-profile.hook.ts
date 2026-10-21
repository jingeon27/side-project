'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useNotify } from '@/shared/ui';

import { saveGameAccountMutationOptions } from './game-profile.mutation-options';

export function useSaveGameAccount() {
  const client = useQueryClient();
  const notify = useNotify();
  return useMutation(saveGameAccountMutationOptions(client, notify));
}
