import { NOTIFICATION_RETRY_BASE_MS, NOTIFICATION_RETRY_MAX_MS } from '../config/limits';

/** 연속 실패 횟수(1부터)에 따른 다음 시도까지의 대기. 1분부터 두 배씩 늘려 최대 1시간에서 멈춘다. */
export function notificationRetryDelayMs(failures: number) {
  const exponent = Math.max(Math.floor(failures) - 1, 0);
  return Math.min(NOTIFICATION_RETRY_BASE_MS * 2 ** Math.min(exponent, 30), NOTIFICATION_RETRY_MAX_MS);
}
