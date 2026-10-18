import { mutationOptions } from '@tanstack/react-query';

interface IRecoveryActions {
  onReset?: () => void | Promise<unknown>;
  refreshOnRetry?: boolean;
  reset: () => void;
  retry: () => void;
}

export function errorRecoveryMutationOptions() {
  return mutationOptions({
    mutationKey: ['ui', 'error-recovery'],
    retry: false,
    throwOnError: false,
    gcTime: 0,
    mutationFn: async ({ onReset, refreshOnRetry, reset, retry }: IRecoveryActions) => {
      await onReset?.();
      if (refreshOnRetry) {
        retry();
        return;
      }
      reset();
    },
  });
}
