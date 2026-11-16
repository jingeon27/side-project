import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import type { TLocale } from '@/shared/i18n';

import { synchronizePush } from '../api/push-registration';
import { pushStatusOptions } from './push.options';

export function enablePushMutationOptions(client: QueryClient, userId: string, locale: TLocale) {
  return mutationOptions({
    mutationKey: ['push-status', userId, 'enable'],
    mutationFn: () => synchronizePush(true, locale),
    onSuccess: (status) => client.setQueryData(pushStatusOptions(userId, locale).queryKey, status),
  });
}
