import { useMutation } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { uploadPostMediaMutationOptions } from '@/features/post-media';

export function usePostMediaUpload() {
  const { session } = useSession();
  const upload = useMutation(uploadPostMediaMutationOptions(session.user?.id));
  const { mutateAsync } = upload;
  return { upload, handleUpload: mutateAsync };
}
