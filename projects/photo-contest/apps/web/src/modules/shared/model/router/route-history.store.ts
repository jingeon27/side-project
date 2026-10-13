import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'photo-contest:route-depth';

type TExpectedNavigation = 'push' | 'replace';

let depth = 0;
let expected: TExpectedNavigation | null = null;
let traversedPathname: string | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

const persist = () => {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(depth));
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 이번 문서 안에서만 센다.
  }
};

const readStoredDepth = () => {
  try {
    const value = Number(window.sessionStorage.getItem(STORAGE_KEY));
    return Number.isInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
};

/**
 * 앱 안에서 쌓은 화면 기록의 깊이. 0이면 이 탭에서 처음 연 화면(카카오톡 링크 등으로 바로 들어온 경우)이라
 * 뒤로 가기를 router.back() 대신 상위 화면 이동으로 처리한다. 새로고침해도 이어지도록 sessionStorage에 둔다.
 */
export const routeHistoryStore = {
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getDepth: () => depth,
  getServerDepth: () => 0,
  /** 문서를 열 때 한 번. 새로 들어왔으면 0부터, 새로고침·앞뒤 이동이면 저장된 깊이를 이어 쓴다. */
  start: (navigationType: string | undefined) => {
    depth = navigationType === 'reload' || navigationType === 'back_forward' ? readStoredDepth() : 0;
    expected = null;
    traversedPathname = null;
    persist();
    emit();
  },
  /** 다음 경로 변경이 push인지 replace인지 미리 알린다. 알리지 않은 변경은 push로 센다. */
  expect: (kind: TExpectedNavigation) => {
    expected = kind;
  },
  /** popstate로 도착한 경로. 이 경로로 바뀌면 앞뒤 이동으로 센다. */
  markTraversal: (pathname: string) => {
    traversedPathname = pathname;
  },
  /** 경로가 바뀐 뒤 한 번 부른다. */
  record: (pathname: string) => {
    if (traversedPathname === pathname) depth = Math.max(0, depth - 1);
    else if (expected !== 'replace') depth += 1;
    expected = null;
    traversedPathname = null;
    persist();
    emit();
  },
};

/** 앱 안 기록 깊이. 서버 렌더링과 첫 hydration에서는 0이다. */
export function useRouteHistoryDepth() {
  return useSyncExternalStore(
    routeHistoryStore.subscribe,
    routeHistoryStore.getDepth,
    routeHistoryStore.getServerDepth,
  );
}
