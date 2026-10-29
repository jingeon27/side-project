import {
  MediaUploadInputSchema,
  type TMediaUploadInput,
  type TMediaUploadPlan,
} from '@game-feedback/contracts';

import { ApiError, withApiError } from './request';

interface IMediaUploadActions<TMedia> {
  reserve: (input: TMediaUploadInput) => Promise<TMediaUploadPlan>;
  complete: (id: string) => Promise<TMedia>;
  remove: (id: string) => Promise<unknown>;
}

export async function uploadMediaFile<TMedia>(file: File, actions: IMediaUploadActions<TMedia>) {
  const input = MediaUploadInputSchema.safeParse({ name: file.name, mimeType: file.type, size: file.size });
  if (!input.success) throw new ApiError(400, 'INVALID_MEDIA', '사진이나 동영상을 25MB 이하로 선택해주세요.');
  const plan = await withApiError(actions.reserve(input.data));
  return withApiError(uploadDirect(plan, file, actions));
}

async function uploadDirect<TMedia>(
  plan: TMediaUploadPlan,
  file: File,
  actions: IMediaUploadActions<TMedia>,
) {
  try {
    const body = new FormData();
    Object.entries(plan.fields).forEach(([name, value]) => body.append(name, value));
    // S3 POST policy는 file 필드가 마지막이어야 한다.
    body.append('file', file);
    const response = await fetch(plan.url, {
      method: 'POST',
      body,
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok)
      throw new ApiError(502, 'UPLOAD_FAILED', '파일 전송에 실패했어요. 파일을 다시 선택해주세요.');
    return await actions.complete(plan.id);
  } catch (error) {
    try {
      await actions.remove(plan.id);
    } catch {
      // 정리 오류가 원래 업로드 오류를 덮지 않게 한다.
    }
    throw error;
  }
}
