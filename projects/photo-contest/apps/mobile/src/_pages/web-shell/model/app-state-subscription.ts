import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

import { nextBridgeAppState, type TBridgeAppState } from '../lib/app-state';

/** OS 구독의 수명 안에서만 전이 이력을 보존하고 중복·inactive 이벤트를 거른다. */
export class AppStateSubscription {
  private previous: TBridgeAppState;
  private readonly lifetime = new AbortController();
  private readonly subscription: NativeEventSubscription;

  constructor(private readonly onState: (state: TBridgeAppState) => void) {
    this.previous = AppState.currentState === 'background' ? 'background' : 'active';
    this.subscription = AppState.addEventListener('change', this.handleState);
  }

  private readonly handleState = (next: AppStateStatus) => {
    if (this.lifetime.signal.aborted) return;
    const state = nextBridgeAppState(this.previous, next);
    if (!state) return;
    this.previous = state;
    this.onState(state);
  };

  dispose() {
    this.lifetime.abort();
    this.subscription.remove();
  }
}
