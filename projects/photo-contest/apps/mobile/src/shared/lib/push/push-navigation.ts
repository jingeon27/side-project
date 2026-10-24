/** 푸시는 알림함만 열 수 있다. 외부 주소와 인증 콜백은 거부한다. */
export function pushInboxPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value === '/notifications' ? value : null;
}
