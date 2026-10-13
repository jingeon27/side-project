import { getInitialURL } from 'expo-linking';
import { useEffect, useState } from 'react';

import { toWebPath } from '../lib/deep-link';
import { LINK_OPTIONS } from './link-options';

const HOME_PATH = '/';

/** 앱을 연 링크를 첫 웹 경로로 바꾼다. 링크가 없거나 모르는 링크면 홈. 읽는 동안은 null. */
export function useInitialPath() {
  const [initialPath, setInitialPath] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    getInitialURL().then(
      (url) => {
        if (isActive) setInitialPath((url && toWebPath(url, LINK_OPTIONS)) || HOME_PATH);
      },
      () => {
        if (isActive) setInitialPath(HOME_PATH);
      },
    );
    return () => {
      isActive = false;
    };
  }, []);

  return initialPath;
}
