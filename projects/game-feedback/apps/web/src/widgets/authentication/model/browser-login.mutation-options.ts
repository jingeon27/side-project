import { mutationOptions } from '@tanstack/react-query';
import { flushAnalytics } from '@/shared/analytics';
import type { TSocialProvider } from '@game-feedback/contracts';

export function browserLoginMutationOptions() {
  return mutationOptions({
    mutationKey: ['authentication', 'browser-login'],
    mutationFn: async ({ form }: { form: HTMLFormElement; provider: TSocialProvider }) => {
      await flushAnalytics();
      HTMLFormElement.prototype.submit.call(form);
    },
  });
}
