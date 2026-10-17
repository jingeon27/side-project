'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createAnswerMutationOptions,
  updateAnswerMutationOptions,
  deleteAnswerMutationOptions,
  helpfulAnswerMutationOptions,
} from './answer.mutation-options';

export function useCreateAnswerMutation() {
  const client = useQueryClient();
  return useMutation(createAnswerMutationOptions(client));
}

export function useUpdateAnswerMutation() {
  const client = useQueryClient();
  return useMutation(updateAnswerMutationOptions(client));
}

export function useDeleteAnswerMutation() {
  const client = useQueryClient();
  return useMutation(deleteAnswerMutationOptions(client));
}

export function useHelpfulAnswerMutation() {
  const client = useQueryClient();
  return useMutation(helpfulAnswerMutationOptions(client));
}
