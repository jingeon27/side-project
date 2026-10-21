import { useCallback } from 'react';

import { useMutation } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { uploadPostMediaMutationOptions } from '@/features/post-media';

export function usePostMediaUpload() {
  const { session } = useSession();
  const upload = useMutation(uploadPostMediaMutationOptions(session.user?.id));
  const { mutateAsync } = upload;
  const handleUpload = useCallback((file: File) => mutateAsync(file), [mutateAsync]);
  return { upload, handleUpload };
}
