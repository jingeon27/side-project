import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAnalytics, resolveIdentityChange, type TAnalyticsSdk } from './create-analytics';

const API_KEY = 'amplitude-test-key';

function createFakeSdk() {
  const sdk = {
    init: vi.fn((): { promise: Promise<void> } => ({ promise: Promise.resolve() })),
    track: vi.fn(() => ({ promise: Promise.resolve() })),
    getDeviceId: vi.fn((): string | undefined => 'device-1'),
    getUserId: vi.fn((): string | undefined => undefined),
    setUserId: vi.fn(),
    reset: vi.fn(),
  };
  return { sdk, typedSdk: sdk as unknown as TAnalyticsSdk };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createAnalytics', () => {
  it('키가 없으면 초기화도 전송도 하지 않고 웹에 넘길 기기 ID는 null이어야 한다', async () => {
    const { sdk, typedSdk } = createFakeSdk();
    const analytics = createAnalytics({ apiKey: null, sdk: typedSdk });

    await expect(analytics.start()).resolves.toBeNull();
    analytics.track({ name: 'app_foregrounded' });
    analytics.applyAuth({ signedIn: true, userId: 'cuser1' });

    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.track).not.toHaveBeenCalled();
    expect(sdk.setUserId).not.toHaveBeenCalled();
  });

  it('한 번만 초기화하고, 자동 수집과 광고 식별자를 끈 채 기기 ID를 돌려줘야 한다', async () => {
    const { sdk, typedSdk } = createFakeSdk();
    const analytics = createAnalytics({ apiKey: API_KEY, sdk: typedSdk });

    const [first, second] = await Promise.all([analytics.start(), analytics.start()]);

    expect(first).toBe('device-1');
    expect(second).toBe('device-1');
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledWith(API_KEY, undefined, {
      autocapture: false,
      trackingOptions: { adid: false, appSetId: false, idfv: false, ipAddress: false },
    });
  });

  it('초기화가 실패하면 기기 ID 없이 진행해야 한다', async () => {
    const rejecting = createFakeSdk();
    rejecting.sdk.init.mockReturnValue({ promise: Promise.reject(new Error('storage unavailable')) });
    const throwing = createFakeSdk();
    throwing.sdk.init.mockImplementation(() => {
      throw new Error('native module missing');
    });
    const unreadable = createFakeSdk();
    unreadable.sdk.getDeviceId.mockImplementation(() => {
      throw new Error('config missing');
    });

    await expect(createAnalytics({ apiKey: API_KEY, sdk: rejecting.typedSdk }).start()).resolves.toBeNull();
    await expect(createAnalytics({ apiKey: API_KEY, sdk: throwing.typedSdk }).start()).resolves.toBeNull();
    await expect(createAnalytics({ apiKey: API_KEY, sdk: unreadable.typedSdk }).start()).resolves.toBeNull();
  });

  it('초기화가 늦으면 정한 시간만 기다리고 기기 ID 없이 진행해야 한다', async () => {
    vi.useFakeTimers();
    const { sdk, typedSdk } = createFakeSdk();
    sdk.init.mockReturnValue({ promise: new Promise(() => undefined) });
    const analytics = createAnalytics({ apiKey: API_KEY, sdk: typedSdk, startTimeoutMs: 1_500 });

    const started = analytics.start();
    await vi.advanceTimersByTimeAsync(1_500);

    await expect(started).resolves.toBeNull();
  });

  it('시간 초과 뒤 초기화가 거부되어도 같은 시작 결과를 유지하고 늦은 실패를 처리해야 한다', async () => {
    vi.useFakeTimers();
    const { sdk, typedSdk } = createFakeSdk();
    const initialization = Promise.withResolvers<void>();
    sdk.init.mockReturnValue({ promise: initialization.promise });
    const analytics = createAnalytics({ apiKey: API_KEY, sdk: typedSdk, startTimeoutMs: 1_500 });
    const started = analytics.start();
    expect(analytics.start()).toBe(started);
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(started).resolves.toBeNull();
    initialization.reject(new Error('late initialization failure'));
    await vi.runAllTimersAsync();
    expect(analytics.start()).toBe(started);
    expect(sdk.init).toHaveBeenCalledOnce();
    expect(sdk.getDeviceId).not.toHaveBeenCalled();
  });

  it('웹 앱 정보 스키마(1~128자)를 벗어난 기기 ID는 넘기지 않아야 한다', async () => {
    for (const deviceId of ['', 'x'.repeat(129), undefined]) {
      const { sdk, typedSdk } = createFakeSdk();
      sdk.getDeviceId.mockReturnValue(deviceId);

      await expect(createAnalytics({ apiKey: API_KEY, sdk: typedSdk }).start()).resolves.toBeNull();
    }
  });

  it('이벤트 이름과 속성을 보내고, 속성이 없는 이벤트는 이름만 보내야 한다', () => {
    const { sdk, typedSdk } = createFakeSdk();
    const analytics = createAnalytics({ apiKey: API_KEY, sdk: typedSdk });

    analytics.track({ name: 'app_opened', properties: { source: 'deep_link' } });
    analytics.track({ name: 'native_share_dismissed' });

    expect(sdk.track.mock.calls).toEqual([
      ['app_opened', { source: 'deep_link' }],
      ['native_share_dismissed'],
    ]);
  });

  it('SDK가 던져도 부른 쪽 흐름으로 오류를 넘기지 않아야 한다', () => {
    const { sdk, typedSdk } = createFakeSdk();
    sdk.track.mockImplementation(() => {
      throw new Error('queue full');
    });
    sdk.getUserId.mockImplementation(() => {
      throw new Error('not ready');
    });
    const analytics = createAnalytics({ apiKey: API_KEY, sdk: typedSdk });

    expect(() => analytics.track({ name: 'app_foregrounded' })).not.toThrow();
    expect(() => analytics.applyAuth({ signedIn: false })).not.toThrow();
  });

  it('웹 로그인 상태가 바뀐 경우에만 사용자를 식별하거나 초기화해야 한다', () => {
    const { sdk, typedSdk } = createFakeSdk();
    const analytics = createAnalytics({ apiKey: API_KEY, sdk: typedSdk });

    analytics.applyAuth({ signedIn: false });
    analytics.applyAuth({ signedIn: true, userId: 'cuser1' });
    expect(sdk.reset).not.toHaveBeenCalled();
    expect(sdk.setUserId).toHaveBeenCalledWith('cuser1');

    sdk.getUserId.mockReturnValue('cuser1');
    sdk.setUserId.mockClear();
    analytics.applyAuth({ signedIn: true, userId: 'cuser1' });
    expect(sdk.setUserId).not.toHaveBeenCalled();

    analytics.applyAuth({ signedIn: true, userId: 'cuser2' });
    expect(sdk.reset).toHaveBeenCalledTimes(1);
    expect(sdk.setUserId).toHaveBeenCalledWith('cuser2');
    expect(sdk.reset.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.setUserId.mock.invocationCallOrder[0] ?? 0,
    );

    analytics.applyAuth({ signedIn: false });
    expect(sdk.reset).toHaveBeenCalledTimes(2);
  });
});

describe('resolveIdentityChange', () => {
  it('로그인·로그아웃·사용자 변경을 구분하고, 바뀌지 않았으면 null이어야 한다', () => {
    expect(resolveIdentityChange(undefined, { signedIn: true, userId: 'cuser1' })).toEqual({
      action: 'identify',
      userId: 'cuser1',
    });
    expect(resolveIdentityChange('cuser1', { signedIn: true, userId: 'cuser2' })).toEqual({
      action: 'switch',
      userId: 'cuser2',
    });
    expect(resolveIdentityChange('cuser1', { signedIn: false })).toEqual({ action: 'reset' });

    expect(resolveIdentityChange('cuser1', { signedIn: true, userId: 'cuser1' })).toBeNull();
    // 예전 웹처럼 userId를 싣지 않으면 누구인지 알 수 없어 그대로 둔다.
    expect(resolveIdentityChange(undefined, { signedIn: true })).toBeNull();
    // 비로그인 상태를 다시 알릴 때마다 reset하면 기기 ID가 계속 바뀐다.
    expect(resolveIdentityChange(undefined, { signedIn: false })).toBeNull();
  });
});
