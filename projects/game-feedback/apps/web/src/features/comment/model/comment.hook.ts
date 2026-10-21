'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createCommentMutationOptions,
  deleteCommentMutationOptions,
  updateCommentMutationOptions,
} from './comment.mutation-options';

export function useCreateCommentMutation() {
  const client = useQueryClient();
  return useMutation(createCommentMutationOptions(client));
}

export function useUpdateCommentMutation() {
  const client = useQueryClient();
  return useMutation(updateCommentMutationOptions(client));
}

export function useDeleteCommentMutation() {
  const client = useQueryClient();
  return useMutation(deleteCommentMutationOptions(client));
}
