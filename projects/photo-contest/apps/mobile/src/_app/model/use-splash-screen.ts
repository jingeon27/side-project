import { hideAsync, preventAutoHideAsync } from 'expo-splash-screen';
import { useCallback, useEffect, useRef } from 'react';

/** 웹이 끝내 알리지 않아도(느린 네트워크) 스플래시에 갇히지 않게 한다. 그 뒤에는 로딩 오버레이가 보인다. */
const SPLASH_MAX_MS = 10_000;

/** 모듈을 읽을 때 불러야 첫 프레임에 스플래시가 자동으로 닫히기 전에 막을 수 있다. */
export function keepSplashScreen() {
  void preventAutoHideAsync().catch(() => undefined);
}

export function hideSplashScreen() {
  void hideAsync().catch(() => undefined);
}

/** 첫 화면이 준비되면 스플래시를 한 번만 닫는 함수를 돌려준다. */
export function useSplashScreen() {
  const isHiddenRef = useRef(false);

  const hideSplash = useCallback(() => {
    if (isHiddenRef.current) return;
    isHiddenRef.current = true;
    hideSplashScreen();
  }, []);

  useEffect(() => {
    const timer = setTimeout(hideSplash, SPLASH_MAX_MS);
    return () => clearTimeout(timer);
  }, [hideSplash]);

  return hideSplash;
}
