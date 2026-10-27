import { mutationOptions, type QueryClient } from '@tanstack/react-query';
import type { z } from 'zod';

import { UpdateProfileInputSchema } from '@game-feedback/contracts';
import { deleteProfileAvatar, updateProfile } from '@game-feedback/sdk';

import { sessionOptions } from '@/features/auth';
import { chatScopeOptions } from '@/features/chat';
import { postDetailOptions, postListOptions } from '@/features/post';
import { withApiError, type PublicProfile } from '@/shared/api';

import { uploadAvatar } from '../api/avatar.api';
import { profileOptions } from './user.options';

/** 프로필 수정 시트의 모든 저장(정보·링크·사진)이 공유하는 key 접두사. 진행 중이면 시트를 닫지 않는다. */
export const profileMutationKey = ['user', 'profile'] as const;

async function saveProfile(client: QueryClient, profile: PublicProfile) {
  client.setQueryData(profileOptions(profile.author.id).queryKey, profile);
  await Promise.all([
    client.invalidateQueries(sessionOptions()),
    client.invalidateQueries(postListOptions()),
    client.invalidateQueries(postDetailOptions()),
    client.invalidateQueries(chatScopeOptions()),
  ]);
}
export function updateProfileMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: [...profileMutationKey, 'update'],
    mutationFn: (input: z.infer<typeof UpdateProfileInputSchema>) => withApiError(updateProfile(input)),
    onSuccess: (profile) => saveProfile(client, profile),
  });
}
export function uploadAvatarMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: [...profileMutationKey, 'upload-avatar'],
    mutationFn: (file: File) => uploadAvatar(file),
    onSuccess: (profile) => saveProfile(client, profile),
  });
}
export function deleteAvatarMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: [...profileMutationKey, 'delete-avatar'],
    mutationFn: () => withApiError(deleteProfileAvatar()),
    onSuccess: (profile) => saveProfile(client, profile),
  });
}
