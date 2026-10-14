import { describe, expect, it } from 'vitest';

import { nextBridgeAppState } from './app-state';

describe('nextBridgeAppState', () => {
  it('active와 background 사이를 오갈 때만 알려야 한다', () => {
    expect(nextBridgeAppState('active', 'background')).toBe('background');
    expect(nextBridgeAppState('background', 'active')).toBe('active');
  });

  it('같은 상태가 반복되거나 inactive를 거치면 알리지 않아야 한다', () => {
    expect(nextBridgeAppState('active', 'active')).toBeNull();
    expect(nextBridgeAppState('active', 'inactive')).toBeNull();
    expect(nextBridgeAppState('background', 'background')).toBeNull();
    expect(nextBridgeAppState('background', 'inactive')).toBeNull();
    expect(nextBridgeAppState('active', 'unknown')).toBeNull();
    expect(nextBridgeAppState('active', 'extension')).toBeNull();
  });
});
