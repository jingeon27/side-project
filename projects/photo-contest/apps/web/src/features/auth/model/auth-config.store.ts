import { useSyncExternalStore } from 'react';

import { fetchAuthConfig, type TAuthConfig } from '../api/auth-request.helper';

export type TAuthConfigState =
  { status: 'loading' } | { status: 'ready'; config: TAuthConfig } | { status: 'failed' };

const LOADING: TAuthConfigState = { status: 'loading' };

let state: TAuthConfigState = LOADING;
let request: Promise<void> | null = null;
const listeners = new Set<() => void>();

const setState = (next: TAuthConfigState) => {
  state = next;
  listeners.forEach((listener) => listener());
};

const load = () => {
  request ??= fetchAuthConfig().then(
    (config) => setState({ status: 'ready', config }),
    () => setState({ status: 'failed' }),
  );
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (state.status === 'loading') load();
  return () => {
    listeners.delete(listener);
  };
};

/**
 * 서버에 켜진 로그인 수단(`/backend/auth/config`). 문서마다 한 번만 부르고 여러 로그인 패널이 같은 결과를 쓴다.
 * 서버 렌더링과 첫 hydration에서는 loading이다.
 */
export function useAuthConfig() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => LOADING,
  );
}

/** 불러오기에 실패했을 때 다시 시도한다. */
export function retryAuthConfig() {
  request = null;
  setState(LOADING);
  load();
}

/** 테스트 전용 */
export function resetAuthConfigForTest() {
  request = null;
  state = LOADING;
  listeners.clear();
}
