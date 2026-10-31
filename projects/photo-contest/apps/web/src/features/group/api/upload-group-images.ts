import dayjs from 'dayjs';

import type { RequestGroupAvatarUploadMutation } from '@/shared/api/generated';
import { uploadWithTicket } from '@/shared/api/upload-to-storage.helper';
import { throwIfClosed } from '@/shared/model/form';

import type { TCompletedGroupImages } from '../model/group-image-upload.schema';

interface IUploadGroupImagesOptions {
  groupId: string;
  images: { avatar: File | null; cover?: File | null };
  completedImages: TCompletedGroupImages;
  onCompleted: (
    kind: keyof TCompletedGroupImages,
    image: NonNullable<TCompletedGroupImages['avatar']>,
  ) => void;
  request: (file: File) => Promise<RequestGroupAvatarUploadMutation['requestGroupAvatarUpload'] | undefined>;
  complete: (uploadId: string) => Promise<string | undefined>;
  signal: AbortSignal;
}

export async function uploadGroupImages({
  groupId,
  images,
  completedImages,
  onCompleted,
  request,
  complete,
  signal,
}: IUploadGroupImagesOptions) {
  const uploadImage = async (kind: keyof TCompletedGroupImages, file: File | null | undefined) => {
    throwIfClosed(signal);
    if (!file) return undefined;
    const completed = completedImages[kind];
    if (
      completed?.file === file &&
      completed.groupId === groupId &&
      dayjs(completed.expiresAt).isAfter(dayjs())
    )
      return completed.id;
    const ticket = await request(file);
    if (!ticket) throw new Error('업로드 티켓을 받지 못했습니다.');
    const id = await uploadWithTicket(file, { request: async () => ticket, complete, signal });
    throwIfClosed(signal);
    onCompleted(kind, { groupId, file, id, expiresAt: ticket.expiresAt });
    return id;
  };
  const [avatar, cover] = await Promise.allSettled([
    uploadImage('avatar', images.avatar),
    uploadImage('cover', images.cover),
  ]);
  if (avatar.status === 'rejected') throw avatar.reason;
  if (cover.status === 'rejected') throw cover.reason;
  throwIfClosed(signal);
  return { avatarId: avatar.value, coverId: cover.value };
}
