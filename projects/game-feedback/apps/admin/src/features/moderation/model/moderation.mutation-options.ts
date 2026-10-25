import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import { updateBan, updateReport, updateVerification, updateVisibility } from '../api/moderation.api';
import { reportOptions, userOptions } from './moderation.options';

export function verifyMutationOptions(client: QueryClient, onVerified?: () => Promise<void>) {
  return mutationOptions({
    mutationKey: ['admin-verify'],
    mutationFn: updateVerification,
    onSuccess: (user) => Promise.all([client.invalidateQueries(userOptions(user.id)), onVerified?.()]),
  });
}

export function banMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['admin-ban'],
    mutationFn: updateBan,
    onSuccess: (user) => client.invalidateQueries(userOptions(user.id)),
  });
}

export function reviewMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['admin-review'],
    mutationFn: updateReport,
    onSuccess: () => client.invalidateQueries(reportOptions()),
  });
}

export function visibilityMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['admin-visibility'],
    mutationFn: updateVisibility,
    onSuccess: () => client.invalidateQueries(reportOptions()),
  });
}
