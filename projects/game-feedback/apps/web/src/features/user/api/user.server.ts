import 'server-only';

import { cache } from 'react';
import { notFound } from 'next/navigation';

import { ApiError, getPublicProfile } from '@game-feedback/sdk';

import { publicServerOptions, serverRequestOptions } from '@/shared/api/server';

export const getServerProfile = cache(async (id: string) => {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) notFound();
  try {
    return await getPublicProfile(id, await serverRequestOptions());
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
});
// 상세 공유 이미지(프로필 카드)는 방문자와 무관한 값만 그리므로 쿠키 없이 공유 internal 예산으로 읽는다.
// 방문자별 제한은 src/proxy.ts가 맡는다. 없는 사용자는 null이다.
export async function getPublicServerProfile(id: string) {
  try {
    return await getPublicProfile(id, publicServerOptions());
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
