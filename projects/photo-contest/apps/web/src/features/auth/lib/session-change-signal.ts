export const AUTH_SESSION_SIGNAL = 'photo-contest:session-changed';

/** 알림에는 계정·쿠키를 싣지 않고, 다른 탭이 자기 쿠키로 세션을 다시 확인하게 한다. */
export function notifySessionChanged() {
  try {
    window.localStorage.setItem(AUTH_SESSION_SIGNAL, crypto.randomUUID());
  } catch {
    // 저장소가 막혀도 focus 확인과 mutation의 예상 사용자 헤더가 계정 경계를 지킨다.
  }
}
