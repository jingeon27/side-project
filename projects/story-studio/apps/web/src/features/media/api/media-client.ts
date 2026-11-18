import { z } from 'zod';

import { readJsonResponse } from '../../../shared/api/read-json-response';
import { sceneSchema, taskSchema } from '../../story/model/story';

export async function fetchVideoTask(id: string, signal: AbortSignal) {
  const response = await fetch(`/api/tasks/${id}`, { signal });
  return taskSchema.parse(await readJsonResponse(response, '영상 상태를 확인하지 못했습니다.'));
}

export async function cancelVideoTask({ id, signal }: { id: string; signal: AbortSignal }) {
  const response = await fetch(`/api/tasks/${id}`, { method: 'DELETE', signal });
  return taskSchema.parse(await readJsonResponse(response, '영상 생성을 중단하지 못했습니다.'));
}

const sceneImage = z.object({ asset: sceneSchema.shape.image.unwrap() });

export function parseSceneImage(data: unknown) {
  const result = sceneImage.safeParse(data);
  if (!result.success) throw new Error('이미지 응답을 확인하지 못했습니다.');
  return result.data.asset;
}

export async function uploadSceneImage({ image, signal }: { image: Blob; signal: AbortSignal }) {
  const response = await fetch('/api/assets', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: image,
    signal,
  });
  const data = await readJsonResponse(response, '이미지를 저장하지 못했습니다.');
  return parseSceneImage(data);
}

export async function downloadRenderedVideo(asset: string, signal: AbortSignal) {
  const response = await fetch(asset, { signal });
  if (!response.ok) throw new Error('완성 영상을 열지 못했습니다.');
  return response.blob();
}
