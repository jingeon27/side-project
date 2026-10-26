/**
 * 분석은 한국 방문자만 대상으로 한다. IP 대신 브라우저 시간대로 판별해 네트워크 요청·쿠키 없이 정적 페이지에서 결정한다.
 * 해외 방문자(시간대가 다르거나 판별할 수 없는 경우)에게는 분석 스크립트와 동의 배너를 내보내지 않는다.
 */
export function isTrackedRegion(): boolean {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Seoul';
  } catch {
    return false;
  }
}
