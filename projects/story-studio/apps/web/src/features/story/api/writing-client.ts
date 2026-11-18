import { z } from 'zod';

import { readJsonResponse } from '../../../shared/api/read-json-response';
import { writingStatusSchema } from '../model/story';

const activeJobs = z.object({ jobs: z.array(writingStatusSchema) });

export async function fetchActiveWriting(signal: AbortSignal) {
  const response = await fetch('/api/writing', { signal, cache: 'no-store' });
  return activeJobs.parse(await readJsonResponse(response, '집필 목록을 확인하지 못했습니다.')).jobs;
}

export async function fetchWritingStatus(id: string, signal: AbortSignal) {
  const response = await fetch(`/api/writing/${id}`, { signal, cache: 'no-store' });
  return writingStatusSchema.parse(await readJsonResponse(response, '집필 상태를 확인하지 못했습니다.'));
}

export async function stopWriting(id: string) {
  const response = await fetch(`/api/writing/${id}`, { method: 'DELETE' });
  return writingStatusSchema.parse(await readJsonResponse(response, '집필을 중단하지 못했습니다.'));
}
