'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationListOptions } from '@/features/notification';
import { deletePostById, patchPost, postPost, postPostRead } from '../api/post.api';
import { postDetailOptions, postListOptions } from './post.options';
export function useCreatePostMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: postPost,
    onSuccess: async (post) => {
      await Promise.all([
        client.invalidateQueries(postListOptions()),
        client.invalidateQueries(postDetailOptions(post.id)),
      ]);
    },
  });
}
export function useUpdatePostMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: patchPost,
    onSuccess: async (post) => {
      await Promise.all([
        client.invalidateQueries(postListOptions()),
        client.invalidateQueries(postDetailOptions(post.id)),
      ]);
    },
  });
}
export function useDeletePostMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deletePostById,
    onSuccess: async (_, { id }) => {
      await Promise.all([
        client.invalidateQueries(postListOptions()),
        client.invalidateQueries(postDetailOptions(id)),
        client.invalidateQueries(notificationListOptions()),
      ]);
    },
  });
}
export function useReadPostMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: postPostRead,
    onSuccess: async (_, { id }) => {
      await Promise.all([
        client.invalidateQueries(postDetailOptions(id)),
        client.invalidateQueries(notificationListOptions()),
      ]);
    },
  });
}
