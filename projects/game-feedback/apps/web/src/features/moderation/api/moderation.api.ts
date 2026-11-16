import type { ReportInput } from '@game-feedback/contracts';
import { blockUser, createReport } from '@game-feedback/sdk';

import { withApiError } from '@/shared/api';

// 차단·신고 실패는 열린 확인 창에 그대로 보이므로 브라우저의 연결 오류 원문 대신 다시 시도할 문구로 바꾼다.
export function postBlockUser(body: { blockedUserId: string }) {
  return withApiError(blockUser(body));
}
export function postReport(body: ReportInput) {
  return withApiError(createReport(body));
}
