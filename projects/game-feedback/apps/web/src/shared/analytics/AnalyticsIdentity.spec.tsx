import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ANALYTICS_EVENT } from './analytics.catalog';
import { flushAnalytics, initAnalytics, resetAnalyticsClientForTest, trackEvent } from './analytics.store';
import { AnalyticsIdentity } from './AnalyticsIdentity';
import { LOGIN_MARKER_TTL, savePendingLogin } from './login-marker';

const sdk = vi.hoisted(() => ({
  userId: undefined as string | undefined,
  create: vi.fn(),
  init: vi.fn(),
  add: vi.fn(),
  track: vi.fn(),
  setUserId: vi.fn(),
  reset: vi.fn(),
  flush: vi.fn(),
}));
vi.mock('@amplitude/analytics-browser', () => ({
  createInstance: () => {
    sdk.create();
    return {
      init: sdk.init,
      add: sdk.add,
      track: sdk.track,
      setUserId: sdk.setUserId,
      getUserId: () => sdk.userId,
      reset: sdk.reset,
      flush: sdk.flush,
    };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  resetAnalyticsClientForTest();
  sessionStorage.clear();
  sdk.userId = undefined;
  sdk.setUserId.mockImplementation((id) => {
    sdk.userId = id;
  });
  sdk.reset.mockImplementation(() => {
    sdk.userId = undefined;
  });
  sdk.flush.mockReturnValue({ promise: Promise.resolve() });
});
afterEach(() => {
  sessionStorage.clear();
  resetAnalyticsClientForTest();
});
describe('분석 식별과 로그인 성공 이벤트', () => {
  it('키가 없으면 SDK 생성과 이벤트 전송을 하지 않아야 한다', async () => {
    initAnalytics('');
    trackEvent(ANALYTICS_EVENT.LoginOpened, {});
    await flushAnalytics();
    expect(sdk.create).not.toHaveBeenCalled();
    expect(sdk.track).not.toHaveBeenCalled();
  });
  it('복원된 세션은 식별하되 로그인을 다시 집계하지 않아야 한다', () => {
    initAnalytics('test');
    const view = render(<AnalyticsIdentity userId="one" needsOnboarding={false} />);
    view.rerender(<AnalyticsIdentity userId="one" needsOnboarding={false} />);
    expect(sdk.setUserId).toHaveBeenCalledTimes(1);
    expect(sdk.track).not.toHaveBeenCalled();
  });
  it('이 탭에서 선택한 로그인만 성공 시 한 번 집계해야 한다', () => {
    initAnalytics('test');
    savePendingLogin('google');
    const view = render(<AnalyticsIdentity userId="one" needsOnboarding={false} />);
    view.rerender(<AnalyticsIdentity userId="one" needsOnboarding={false} />);
    expect(sdk.track).toHaveBeenCalledExactlyOnceWith('login_succeeded', { provider: 'google' });
  });
  it('가입 대기를 거친 사용자는 로그인 대신 가입 완료로 집계해야 한다', () => {
    initAnalytics('test');
    savePendingLogin('kakao');
    const view = render(<AnalyticsIdentity needsOnboarding />);
    view.rerender(<AnalyticsIdentity userId="new" needsOnboarding={false} />);
    expect(sdk.track).toHaveBeenCalledExactlyOnceWith('signup_completed', { provider: 'kakao' });
  });
  it('계정 전환과 로그아웃은 이전 식별자를 지우고 다른 탭 로그인은 중복 집계하지 않아야 한다', () => {
    initAnalytics('test');
    const view = render(<AnalyticsIdentity userId="one" needsOnboarding={false} />);
    view.rerender(<AnalyticsIdentity userId="two" needsOnboarding={false} />);
    expect(sdk.reset).toHaveBeenCalledTimes(1);
    expect(sdk.userId).toBe('two');
    view.rerender(<AnalyticsIdentity needsOnboarding={false} />);
    expect(sdk.userId).toBeUndefined();
    expect(sdk.reset).toHaveBeenCalledTimes(2);
    expect(sdk.track).not.toHaveBeenCalled();
  });
  it('30분이 지난 로그인 표시는 성공 횟수에 넣지 않아야 한다', () => {
    initAnalytics('test');
    savePendingLogin('discord', Date.now() - LOGIN_MARKER_TTL - 1);
    render(<AnalyticsIdentity userId="one" needsOnboarding={false} />);
    expect(sdk.track).not.toHaveBeenCalled();
  });
  it('IP와 클릭·리플레이 수집을 끄고 자동 페이지뷰를 한 번만 초기화해야 한다', () => {
    initAnalytics('test');
    initAnalytics('test');
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({
        trackingOptions: { ipAddress: false },
        autocapture: expect.objectContaining({
          pageViews: { trackHistoryChanges: 'all' },
          elementInteractions: false,
        }),
      }),
    );
  });
});
