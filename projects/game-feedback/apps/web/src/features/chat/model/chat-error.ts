import { match } from 'ts-pattern';

import { ApiError } from '@/shared/api';

export function chatError(error: unknown): string {
  if (!(error instanceof ApiError)) return '연결을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
  // errorCode는 서버가 보낸 열린 문자열이라 모르는 코드는 서버 메시지를 그대로 보인다.
  return match(error.errorCode)
    .with(
      'CONVERSATION_NOT_FOUND',
      () => '이 대화를 열 수 없어요. 상대가 탈퇴했거나 차단 상태가 바뀌었을 수 있어요.',
    )
    .with('RECIPIENT_UNAVAILABLE', () => '현재 이 사용자와 대화를 시작할 수 없어요.')
    .with('MESSAGE_CONFLICT', () => '전송 내용이 변경되었어요. 내용을 확인하고 새 메시지로 보내주세요.')
    .with('RATE_LIMITED', () => '메시지를 너무 빠르게 보내고 있어요. 잠시 뒤 다시 시도해 주세요.')
    .with('AUTH_REQUIRED', () => '로그인이 만료되었어요. 다시 로그인해 주세요.')
    .otherwise(() => error.message);
}
