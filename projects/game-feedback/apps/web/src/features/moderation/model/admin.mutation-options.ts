import { mutationOptions, type QueryClient } from '@tanstack/react-query';
import { sessionOptions } from '@/features/auth';
import { postListOptions, postDetailOptions } from '@/features/post';
import { adminReportOptions, adminUserOptions } from './admin.options';
import { patchReport, patchUserBan, patchVerification, patchVisibility } from '../api/admin.api';

const invalidateUsers = (client: QueryClient) =>
  Promise.all([
    client.invalidateQueries(adminUserOptions()),
    client.invalidateQueries(sessionOptions()),
    client.invalidateQueries(postListOptions()),
    client.invalidateQueries(postDetailOptions()),
  ]);
export function reviewReportMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['moderation', 'review-report'],
    mutationFn: patchReport,
    onSuccess: () => client.invalidateQueries(adminReportOptions()),
  });
}
export function banUserMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['moderation', 'ban-user'],
    mutationFn: patchUserBan,
    onSuccess: () => invalidateUsers(client),
  });
}
export function verifyUserMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['moderation', 'verify-user'],
    mutationFn: patchVerification,
    onSuccess: () => invalidateUsers(client),
  });
}
export function hideContentMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['moderation', 'hide-content'],
    mutationFn: patchVisibility,
    onSuccess: () => invalidateUsers(client),
  });
}
