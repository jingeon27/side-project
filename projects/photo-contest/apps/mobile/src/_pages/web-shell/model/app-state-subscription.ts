import { AppState, type AppStateStatus } from 'react-native';

import { nextBridgeAppState, type TBridgeAppState } from '../lib/app-state';

/** OS 구독의 수명 안에서만 전이 이력을 보존하고 중복·inactive 이벤트를 거른다. */
export class AppStateSubscription {
  private readonly lifetime = new AbortController();

  constructor(
    private readonly onState: (state: TBridgeAppState) => void,
    private previous: TBridgeAppState = AppState.currentState === 'background' ? 'background' : 'active',
  ) {}

  private readonly handleState = (next: AppStateStatus) => {
    if (this.lifetime.signal.aborted) return;
    const state = nextBridgeAppState(this.previous, next);
    if (!state) return;
    this.previous = state;
    this.onState(state);
  };

  private readonly subscription = AppState.addEventListener('change', this.handleState);

  dispose() {
    this.lifetime.abort();
    this.subscription.remove();
  }
}
