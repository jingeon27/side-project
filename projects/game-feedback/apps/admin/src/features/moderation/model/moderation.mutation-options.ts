import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import { threadOptions } from '@/features/support';

import { updateBan, updateReport, updateVerification, updateVisibility } from '../api/moderation.api';
import { reportOptions, userOptions } from './moderation.options';

export function verifyMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['admin-verify'],
    mutationFn: updateVerification,
    // 문의함 카드도 요청자의 인증 상태를 보여 주므로 함께 갱신한다.
    onSuccess: (user) =>
      Promise.all([
        client.invalidateQueries(userOptions(user.id)),
        client.invalidateQueries(threadOptions()),
      ]),
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
