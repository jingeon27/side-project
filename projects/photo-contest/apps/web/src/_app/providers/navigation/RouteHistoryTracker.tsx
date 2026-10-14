'use client';

import { useRouteHistoryTracker } from '@/shared/model/router';

/** 앱 안 화면 기록 깊이를 센다. 뒤로 가기가 이전 화면과 상위 화면 중 어디로 갈지 정할 때 쓴다. */
export function RouteHistoryTracker() {
  useRouteHistoryTracker();
  return null;
}
