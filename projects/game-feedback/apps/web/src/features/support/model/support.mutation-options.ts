import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import { chatScopeOptions } from '@/features/chat';

import { startSupport } from '../api/support.api';

export function startSupportMutationOptions(client: QueryClient, userId?: string) {
  return mutationOptions({
    mutationKey: ['support', userId, 'start'],
    mutationFn: startSupport,
    onSuccess: () => client.invalidateQueries(chatScopeOptions(userId)),
  });
}
