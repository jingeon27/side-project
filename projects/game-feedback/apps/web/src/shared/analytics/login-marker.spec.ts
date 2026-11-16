// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initAnalytics, resetAnalyticsClientForTest } from './analytics.store';
import { savePendingLogin, trackLoginFailure } from './login-marker';

const sdk = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@amplitude/analytics-browser', () => ({
  createInstance: () => ({ init: vi.fn(), add: vi.fn(), track: sdk.track }),
}));
beforeEach(() => {
  sdk.track.mockReset();
  sessionStorage.clear();
  initAnalytics('test');
});
afterEach(() => {
  sessionStorage.clear();
  resetAnalyticsClientForTest();
});

describe('로그인 실패 집계', () => {
  it('이 탭에서 고른 제공자와 실패 이유를 한 번만 보낸다', () => {
    savePendingLogin('kakao');
    trackLoginFailure('expired');
    trackLoginFailure('expired');
    expect(sdk.track).toHaveBeenCalledExactlyOnceWith('login_failed', {
      provider: 'kakao',
      reason: 'expired',
    });
  });

  it('이 탭에서 시작하지 않은 로그인 실패는 보내지 않는다', () => {
    trackLoginFailure('failed');
    expect(sdk.track).not.toHaveBeenCalled();
  });
});
