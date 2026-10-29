import { useEffect, useEffectEvent } from 'react';

import { addEventListener } from 'expo-linking';

import { toWebPath } from '../lib/deep-link';
import { LINK_OPTIONS } from './link-options';

/**
 * 앱이 떠 있는 동안 들어온 링크(앱 스킴·유니버설 링크)를 웹 경로로 바꿔 알린다.
 * 소셜 로그인 콜백과 모르는 링크는 toWebPath가 걸러 낸다.
 */
export function useDeepLinkEvents(onOpenPath: (path: string) => void) {
  const handleOpenPath = useEffectEvent(onOpenPath);

  useEffect(() => {
    const subscription = addEventListener('url', ({ url }) => {
      const path = toWebPath(url, LINK_OPTIONS);
      if (path) handleOpenPath(path);
    });
    return () => subscription.remove();
  }, []);
}
