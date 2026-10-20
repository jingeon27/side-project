import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  verifyMutationOptions,
  banMutationOptions,
  reviewMutationOptions,
  visibilityMutationOptions,
} from './moderation.mutation-options';

export function useVerifyUserMutation() {
  const client = useQueryClient();
  return useMutation(verifyMutationOptions(client));
}

export function useBanUserMutation() {
  const client = useQueryClient();
  return useMutation(banMutationOptions(client));
}

export function useReviewReportMutation() {
  const client = useQueryClient();
  return useMutation(reviewMutationOptions(client));
}

export function useContentVisibilityMutation() {
  const client = useQueryClient();
  return useMutation(visibilityMutationOptions(client));
}
