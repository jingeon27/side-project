import type { TLoginMethod } from '@/shared/model/analytics';

const PENDING_LOGIN_KEY = 'photo-contest:pending-login';
const NOTIFIED_USER_KEY = 'photo-contest:auth-notified-user';
const LOGIN_METHODS = new Set<string>(['google', 'kakao', 'password', 'anonymous']);

export interface IPendingLogin {
  method: TLoginMethod;
  /** 로그인 뒤 돌아갈 같은 origin 상대 경로 */
  next: string;
}

const storage = () => {
  try {
    return window.sessionStorage;
  } catch {
    // 저장소를 막은 환경(사생활 보호 모드 등)에서는 표시 없이 동작한다.
    return null;
  }
};

const isPendingLogin = (value: unknown): value is IPendingLogin =>
  typeof value === 'object' &&
  value !== null &&
  LOGIN_METHODS.has(String(Reflect.get(value, 'method'))) &&
  typeof Reflect.get(value, 'next') === 'string';

/**
 * 로그인 요청을 보내고 문서를 떠나기 전에 남긴다. OAuth는 API가 홈(`/`)으로 돌려보내므로
 * 다음 문서가 이 표시로 로그인 성공 이벤트를 보내고 원래 가려던 경로로 옮긴다.
 */
export function savePendingLogin(pending: IPendingLogin) {
  try {
    storage()?.setItem(PENDING_LOGIN_KEY, JSON.stringify(pending));
  } catch {
    // 표시를 못 남기면 로그인 뒤 홈에 머문다.
  }
}

/** 남긴 표시를 꺼내고 지운다. 한 번만 처리한다. */
export function takePendingLogin(): IPendingLogin | null {
  const store = storage();
  try {
    const raw = store?.getItem(PENDING_LOGIN_KEY);
    store?.removeItem(PENDING_LOGIN_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isPendingLogin(value) ? value : null;
  } catch {
    return null;
  }
}

/** 이 탭에서 앱에 이미 알린 사용자. 같은 사용자를 문서마다 다시 알리지 않으려고 쓴다. */
export function readNotifiedUserId() {
  try {
    return storage()?.getItem(NOTIFIED_USER_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveNotifiedUserId(userId: string | null) {
  try {
    if (userId) storage()?.setItem(NOTIFIED_USER_KEY, userId);
    if (!userId) storage()?.removeItem(NOTIFIED_USER_KEY);
  } catch {
    // 다음 문서에서 한 번 더 알릴 뿐이다.
  }
}
