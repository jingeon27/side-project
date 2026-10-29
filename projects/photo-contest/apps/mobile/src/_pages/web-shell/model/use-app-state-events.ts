import { useEffect, useEffectEvent } from 'react';

import type { INativeRouter } from '@photo-contest/bridge/native';

import { ANALYTICS_EVENT, trackEvent } from '@/features/analytics';

import type { TBridgeAppState } from '../lib/app-state';
import { AppStateSubscription } from './app-state-subscription';

interface IUseAppStateEventsOptions {
  router: INativeRouter;
  isWebReady: () => boolean;
}

/**
 * 앱이 background에 다녀오면 웹에 app.state를 알린다. 웹은 active에서 화면 데이터를 다시 불러온다.
 * 돌아온 횟수(app_foregrounded)는 웹 준비와 상관없이 기록한다.
 */
export function useAppStateEvents(options: IUseAppStateEventsOptions) {
  const emitState = useEffectEvent((state: TBridgeAppState) => {
    if (state === 'active') trackEvent({ name: ANALYTICS_EVENT.AppForegrounded });
    if (options.isWebReady()) options.router.emit('app.state', { state });
  });

  useEffect(() => {
    const subscription = new AppStateSubscription((state) => emitState(state));
    return () => subscription.dispose();
  }, []);
}
