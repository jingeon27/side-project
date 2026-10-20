import { mutationOptions, type QueryClient } from '@tanstack/react-query';
import { updateProfile, uploadProfileAvatar, deleteProfileAvatar } from '@game-feedback/sdk';
import type { z } from 'zod';
import { UpdateProfileInputSchema } from '@game-feedback/contracts';
import { withApiError, type PublicProfile } from '@/shared/api';
import { sessionOptions } from '@/features/auth';
import { profileOptions } from './user.options';

async function saveProfile(client: QueryClient, profile: PublicProfile) {
  client.setQueryData(profileOptions(profile.author.id).queryKey, profile);
  await client.invalidateQueries(sessionOptions());
}
export function updateProfileMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['user', 'update-profile'],
    mutationFn: (input: z.infer<typeof UpdateProfileInputSchema>) => withApiError(updateProfile(input)),
    onSuccess: (profile) => saveProfile(client, profile),
  });
}
export function uploadAvatarMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['user', 'upload-avatar'],
    mutationFn: (file: File) => withApiError(uploadProfileAvatar({ file })),
    onSuccess: (profile) => saveProfile(client, profile),
  });
}
export function deleteAvatarMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['user', 'delete-avatar'],
    mutationFn: () => withApiError(deleteProfileAvatar()),
    onSuccess: (profile) => saveProfile(client, profile),
  });
}
