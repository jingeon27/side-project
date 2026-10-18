import { mutationOptions, type QueryClient } from '@tanstack/react-query';
import { chatScopeOptions } from '@/features/chat';
import { startSupport, updateSupportStatus } from '../api/support.api';
import { supportThreadOptions } from './support.options';
export function startSupportMutationOptions(client: QueryClient, userId?: string) {
  return mutationOptions({
    mutationKey: ['support', userId, 'start'],
    mutationFn: startSupport,
    onSuccess: () => client.invalidateQueries(chatScopeOptions(userId)),
  });
}
export function supportStatusMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['support', 'status'],
    mutationFn: updateSupportStatus,
    onSuccess: () => client.invalidateQueries(supportThreadOptions()),
  });
}
