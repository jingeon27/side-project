import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import { updateBan, updateReport, updateVerification, updateVisibility } from '../api/moderation.api';
import { reportScopeOptions, userOptions } from './moderation.options';

export function verifyMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['admin-verify'],
    mutationFn: updateVerification,
    onSuccess: (user) => client.invalidateQueries(userOptions(user.id)),
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
    onSuccess: () => client.invalidateQueries(reportScopeOptions()),
  });
}

export function visibilityMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['admin-visibility'],
    mutationFn: updateVisibility,
    onSuccess: () => client.invalidateQueries(reportScopeOptions()),
  });
}
