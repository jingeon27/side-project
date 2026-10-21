import { mutationOptions } from '@tanstack/react-query';

import type { TSocialProvider } from '@game-feedback/contracts';

import { flushAnalytics } from '@/shared/analytics';

export function browserLoginMutationOptions() {
  return mutationOptions({
    mutationKey: ['authentication', 'browser-login'],
    mutationFn: async ({ form }: { form: HTMLFormElement; provider: TSocialProvider }) => {
      await flushAnalytics();
      HTMLFormElement.prototype.submit.call(form);
    },
  });
}
