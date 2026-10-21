'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { blockUserMutationOptions, reportMutationOptions } from './moderation.mutation-options';

export function useBlockUserMutation() {
  const client = useQueryClient();
  return useMutation(blockUserMutationOptions(client));
}

export function useReportMutation() {
  return useMutation(reportMutationOptions());
}
