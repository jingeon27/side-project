import type { TWebRequestPayload } from '@photo-contest/bridge';
import { useMemo } from 'react';

import { useBridge } from './bridge.hook';

export type THapticStyle = TWebRequestPayload<'haptics.impact'>['style'];

/** 앱 안에서만 진동 피드백을 준다. 브라우저나 지원하지 않는 앱 버전에서는 아무것도 하지 않는다. */
export function useHaptics() {
  const bridge = useBridge();
  return useMemo(
    () => ({
      impact: (style: THapticStyle = 'light') => {
        if (!bridge?.supports('haptics.impact')) return;
        // 진동은 부가 효과라 실패해도 알리지 않는다.
        bridge.request('haptics.impact', { style }).catch(() => undefined);
      },
    }),
    [bridge],
  );
}
