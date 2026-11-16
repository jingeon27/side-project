import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import { sessionOptions } from '@/features/auth';
import { chatScopeOptions } from '@/features/chat';
import { postDetailOptions, postListOptions } from '@/features/post';
import type { PublicProfile } from '@/shared/api';

import { deleteAvatar, uploadAvatar } from '../api/avatar.api';
import { patchProfile } from '../api/user.api';
import { profileOptions } from './user.options';

/** 프로필 정보와 사진 저장이 공유하는 key 접두사. */
const profileMutationKey = ['user', 'profile'] as const;

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
    mutationFn: patchProfile,
    onSuccess: (profile) => saveProfile(client, profile),
  });
}
export function uploadAvatarMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: [...profileMutationKey, 'upload-avatar'],
    mutationFn: uploadAvatar,
    onSuccess: (profile) => saveProfile(client, profile),
  });
}
export function deleteAvatarMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: [...profileMutationKey, 'delete-avatar'],
    mutationFn: deleteAvatar,
    onSuccess: (profile) => saveProfile(client, profile),
  });
}
