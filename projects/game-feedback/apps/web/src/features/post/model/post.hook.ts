'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createPostMutationOptions,
  deletePostMutationOptions,
  readPostMutationOptions,
  updatePostMutationOptions,
} from './post.mutation-options';

export function useCreatePostMutation() {
  const client = useQueryClient();
  return useMutation(createPostMutationOptions(client));
}

export function useUpdatePostMutation() {
  const client = useQueryClient();
  return useMutation(updatePostMutationOptions(client));
}

export function useDeletePostMutation() {
  const client = useQueryClient();
  return useMutation(deletePostMutationOptions(client));
}

export function useReadPostMutation() {
  const client = useQueryClient();
  return useMutation(readPostMutationOptions(client));
}
