import type { INativeRouter } from '@photo-contest/bridge/native';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useLatest } from '@/shared/lib/use-latest';

import { nextBridgeAppState } from '../lib/app-state';
import type { TBridgeAppState } from '../lib/app-state';

interface IUseAppStateEventsOptions {
  router: INativeRouter;
  isWebReady: () => boolean;
}

/** 앱이 background에 다녀오면 웹에 app.state를 알린다. 웹은 active에서 화면 데이터를 다시 불러온다. */
export function useAppStateEvents(options: IUseAppStateEventsOptions) {
  const optionsRef = useLatest(options);

  useEffect(() => {
    let previous: TBridgeAppState = AppState.currentState === 'background' ? 'background' : 'active';
    const subscription = AppState.addEventListener('change', (next) => {
      const state = nextBridgeAppState(previous, next);
      if (!state) return;
      previous = state;
      const { router, isWebReady } = optionsRef.current;
      if (isWebReady()) router.emit('app.state', { state });
    });
    return () => subscription.remove();
  }, [optionsRef]);
}
