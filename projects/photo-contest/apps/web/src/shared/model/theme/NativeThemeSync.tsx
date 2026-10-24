'use client';

import { useEffect } from 'react';

import { useBridge } from '../bridge';
import { useThemePreference } from './ThemeProvider';

/** WebView 바깥의 안전 영역과 상태 표시줄도 웹에서 선택한 화면 모드를 따른다. */
export function NativeThemeSync() {
  const bridge = useBridge();
  const { preference } = useThemePreference();
  useEffect(() => {
    bridge?.notify('appearance.changed', { preference });
  }, [bridge, preference]);
  return null;
}
