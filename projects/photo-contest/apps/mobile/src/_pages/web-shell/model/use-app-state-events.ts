import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { INativeRouter } from '@photo-contest/bridge/native';

import { ANALYTICS_EVENT } from '@/features/analytics/config/events';
import { trackEvent } from '@/features/analytics/model/analytics';
import { useLatest } from '@/shared/lib/use-latest';

import { nextBridgeAppState, type TBridgeAppState } from '../lib/app-state';

interface IUseAppStateEventsOptions {
  router: INativeRouter;
  isWebReady: () => boolean;
}

/**
 * 앱이 background에 다녀오면 웹에 app.state를 알린다. 웹은 active에서 화면 데이터를 다시 불러온다.
 * 돌아온 횟수(app_foregrounded)는 웹 준비와 상관없이 기록한다.
 */
export function useAppStateEvents(options: IUseAppStateEventsOptions) {
  const optionsRef = useLatest(options);

  useEffect(() => {
    let previous: TBridgeAppState = AppState.currentState === 'background' ? 'background' : 'active';
    const subscription = AppState.addEventListener('change', (next) => {
      const state = nextBridgeAppState(previous, next);
      if (!state) return;
      previous = state;
      if (state === 'active') trackEvent({ name: ANALYTICS_EVENT.AppForegrounded });
      const { router, isWebReady } = optionsRef.current;
      if (isWebReady()) router.emit('app.state', { state });
    });
    return () => subscription.remove();
  }, [optionsRef]);
}
