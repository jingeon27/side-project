// 국가를 정확히 알 수 없으므로 유럽 전체(Europe/*), 대서양·북극의 EEA 지역, 지역을 알 수 없는 UTC류 시간대를 동의 대상으로 둔다.
const optInTimeZone =
  /^(?:Europe\/|Arctic\/|Etc\/|Atlantic\/(?:Azores|Canary|Faroe|Madeira|Reykjavik)$|(?:UTC|GMT|UCT|Universal|Zulu)$)/;

/**
 * EEA·영국·스위스는 분석 쿠키를 저장하기 전에 사전 동의가 필요하다. IP 대신 브라우저 시간대로 판별해 네트워크 요청·쿠키 없이
 * 정적 페이지에서 결정한다. 지문 방지 브라우저처럼 시간대를 감추거나 판별에 실패하면 동의 대상으로 다룬다.
 */
export function requiresOptIn(): boolean {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return !timeZone || optInTimeZone.test(timeZone);
  } catch {
    return true;
  }
}
