import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ANALYTICS_EVENT } from './analytics.catalog';
import {
  flushAnalytics,
  identifyUser,
  initAnalytics,
  resetAnalytics,
  resetAnalyticsClientForTest,
  trackEvent,
} from './analytics.store';
import { toPathTemplate } from './path-template.helper';

const amplitude = vi.hoisted(() => {
  const identifies: Array<Record<string, unknown>> = [];
  const instance = {
    init: vi.fn(),
    track: vi.fn(),
    identify: vi.fn(),
    setUserId: vi.fn(),
    getUserId: vi.fn((): string | undefined => undefined),
    reset: vi.fn(),
    flush: vi.fn(() => ({ promise: Promise.resolve() })),
  };
  class FakeIdentify {
    readonly properties: Record<string, unknown> = {};
    constructor() {
      identifies.push(this.properties);
    }
    set(key: string, value: unknown) {
      this.properties[key] = value;
      return this;
    }
  }
  return { instance, identifies, FakeIdentify, createInstance: vi.fn(() => instance) };
});

vi.mock('@amplitude/analytics-browser', () => ({
  createInstance: amplitude.createInstance,
  Identify: amplitude.FakeIdentify,
}));

beforeEach(() => {
  vi.clearAllMocks();
  amplitude.identifies.length = 0;
  resetAnalyticsClientForTest();
  // unit 프로젝트는 node 환경이라 브라우저인 것처럼 window만 둔다.
  vi.stubGlobal('window', {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('analytics', () => {
  it('API 키가 없으면 아무것도 초기화하거나 보내지 않아야 한다', () => {
    initAnalytics({ apiKey: undefined, app: null });
    trackEvent(ANALYTICS_EVENT.GroupCreated, { group_id: 'group-1' });
    identifyUser('user-1');
    resetAnalytics();

    expect(amplitude.createInstance).not.toHaveBeenCalled();
    expect(amplitude.instance.track).not.toHaveBeenCalled();
    expect(amplitude.instance.setUserId).not.toHaveBeenCalled();
    expect(amplitude.instance.reset).not.toHaveBeenCalled();
  });

  it('서버 렌더링(window 없음)에서는 키가 있어도 초기화하지 않아야 한다', () => {
    vi.unstubAllGlobals();
    initAnalytics({ apiKey: 'key', app: null });
    trackEvent(ANALYTICS_EVENT.VoteCast, { contest_id: 'contest-1' });

    expect(amplitude.createInstance).not.toHaveBeenCalled();
    expect(amplitude.instance.track).not.toHaveBeenCalled();
  });

  it('브라우저에서는 자동 페이지뷰를 끄고 client=web으로 표시해야 한다', () => {
    initAnalytics({ apiKey: 'key', app: null });
    initAnalytics({ apiKey: 'key', app: null });

    expect(amplitude.createInstance).toHaveBeenCalledTimes(1);
    const [apiKey, options] = amplitude.instance.init.mock.calls[0] ?? [];
    expect(apiKey).toBe('key');
    expect(options).toMatchObject({ autocapture: { pageViews: false } });
    expect(options).not.toHaveProperty('deviceId');
    expect(amplitude.identifies).toEqual([{ client: 'web' }]);
  });

  it('앱 WebView 안이면 앱 기기 ID와 플랫폼·앱 버전을 써야 한다', () => {
    initAnalytics({
      apiKey: 'key',
      app: {
        platform: 'android',
        appVersion: '1.2.3',
        protocolVersion: 1,
        capabilities: [],
        analyticsDeviceId: 'native-device',
      },
    });

    expect(amplitude.instance.init.mock.calls[0]?.[1]).toMatchObject({
      deviceId: 'native-device',
      appVersion: '1.2.3',
    });
    expect(amplitude.identifies).toEqual([{ client: 'app', platform: 'android', app_version: '1.2.3' }]);
  });

  it('카탈로그 이벤트를 이름과 속성 그대로 보내야 한다', () => {
    initAnalytics({ apiKey: 'key', app: null });
    trackEvent(ANALYTICS_EVENT.PhotoLiked, { contest_id: 'contest-1', submission_id: 'photo-1' });

    expect(amplitude.instance.track).toHaveBeenCalledWith('photo_liked', {
      contest_id: 'contest-1',
      submission_id: 'photo-1',
    });
  });

  it('카탈로그 밖 이벤트·속성은 타입 오류여야 한다', () => {
    // 실행하지 않고 타입 검사(tsc)에서만 확인한다.
    const typeOnly = () => {
      // @ts-expect-error 카탈로그에 없는 이벤트
      trackEvent('photo_downloaded', { contest_id: 'contest-1' });
      // @ts-expect-error 닉네임처럼 카탈로그에 없는 속성
      trackEvent(ANALYTICS_EVENT.GroupCreated, { group_id: 'group-1', nickname: '진건' });
      // @ts-expect-error 공유 방법은 native | web_share | clipboard만
      trackEvent(ANALYTICS_EVENT.ContestShared, { contest_id: 'contest-1', method: 'kakao' });
    };
    expect(typeOnly).toBeTypeOf('function');
  });

  it('로그인한 사용자를 한 번만 설정하고 로그아웃하면 초기화해야 한다', () => {
    initAnalytics({ apiKey: 'key', app: null });
    identifyUser('user-1');
    amplitude.instance.getUserId.mockReturnValue('user-1');
    identifyUser('user-1');
    resetAnalytics();

    expect(amplitude.instance.setUserId).toHaveBeenCalledTimes(1);
    expect(amplitude.instance.setUserId).toHaveBeenCalledWith('user-1');
    expect(amplitude.instance.reset).toHaveBeenCalledTimes(1);
  });

  it('flush가 늦어도 정해진 시간 안에 끝나야 한다', async () => {
    initAnalytics({ apiKey: 'key', app: null });
    amplitude.instance.flush.mockReturnValue({ promise: new Promise<void>(() => undefined) });

    await expect(flushAnalytics(10)).resolves.toBeUndefined();
  });
});

describe('toPathTemplate', () => {
  it.each([
    ['/', '/'],
    ['', '/'],
    ['/me', '/me'],
    ['/groups/clx1abc', '/groups/:id'],
    ['/contests/clx2def?sort=popular', '/contests/:id'],
    ['/invite/secret-token#top', '/invite/:token'],
    ['/unknown/private-value/more', '/unknown/:path'],
  ])('%s → %s', (path, expected) => {
    expect(toPathTemplate(path)).toBe(expected);
  });

  it('초대 토큰 원문이 남지 않아야 한다', () => {
    expect(toPathTemplate('/invite/abcDEF123')).not.toContain('abcDEF123');
  });
});
