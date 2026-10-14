import type { ErrorEvent } from '@sentry/react-native';
import { describe, expect, it, vi } from 'vitest';

import { createMonitoring, scrubBreadcrumb, scrubEvent } from './create-monitoring';
import type { TMonitoringSdk } from './create-monitoring';

const DSN = 'https://public@sentry.example/1';

function Root() {
  return null;
}

function createFakeSdk() {
  const wrapped = vi.fn(() => null);
  const sdk = {
    init: vi.fn(),
    wrap: vi.fn(() => wrapped),
    captureMessage: vi.fn(() => 'event-id'),
    captureException: vi.fn(() => 'event-id'),
  };
  return { sdk, typedSdk: sdk as unknown as TMonitoringSdk, wrapped };
}

describe('createMonitoring', () => {
  it('DSN이 없으면 초기화하지 않고 루트를 감싸지도, 보내지도 않아야 한다', () => {
    const { sdk, typedSdk } = createFakeSdk();
    const monitoring = createMonitoring({ dsn: null, sdk: typedSdk });

    monitoring.init();
    const root = monitoring.wrap(Root);
    monitoring.captureWarning('webview_load_failed', { status: '502' });
    monitoring.captureError(new Error('boom'), 'in App');

    expect(root).toBe(Root);
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.wrap).not.toHaveBeenCalled();
    expect(sdk.captureMessage).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it('DSN이 있으면 기본 개인정보 수집을 끄고 보내기 전에 지우는 설정으로 초기화해야 한다', () => {
    const { sdk, typedSdk, wrapped } = createFakeSdk();
    const monitoring = createMonitoring({ dsn: DSN, sdk: typedSdk });

    monitoring.init();

    expect(sdk.init).toHaveBeenCalledWith({
      dsn: DSN,
      sendDefaultPii: false,
      beforeSend: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
    });
    expect(monitoring.wrap(Root)).toBe(wrapped);
    expect(sdk.wrap).toHaveBeenCalledWith(Root);
  });

  it('운영 경고는 warning 수준과 태그로, 렌더 오류는 컴포넌트 스택과 함께 보내야 한다', () => {
    const { sdk, typedSdk } = createFakeSdk();
    const monitoring = createMonitoring({ dsn: DSN, sdk: typedSdk });
    const error = new Error('boom');

    monitoring.captureWarning('webview_load_failed', { status: '0', error_code: '-1009' });
    monitoring.captureError(error, '\n    in AppScreens');
    monitoring.captureError(error, null);

    expect(sdk.captureMessage).toHaveBeenCalledWith('webview_load_failed', {
      level: 'warning',
      tags: { status: '0', error_code: '-1009' },
    });
    expect(sdk.captureException.mock.calls).toEqual([
      [error, { contexts: { react: { componentStack: '\n    in AppScreens' } } }],
      [error],
    ]);
  });
});

describe('scrubEvent', () => {
  it('사용자·요청 정보를 지우고 브레드크럼은 데이터만 빼고 남겨야 한다', () => {
    const event: ErrorEvent = {
      type: undefined,
      message: 'webview_load_failed',
      user: { id: 'cuser1', email: 'someone@example.com', ip_address: '10.0.0.1' },
      request: { url: 'https://contest.example/invite/secret-token', cookies: { contest_session: 'x' } },
      tags: { status: '502' },
      breadcrumbs: [
        {
          type: 'http',
          category: 'fetch',
          level: 'info',
          timestamp: 1,
          data: { url: 'https://contest.example/invite/secret-token', method: 'GET' },
        },
        { category: 'touch', message: 'Touch event within element: Pressable', timestamp: 2 },
      ],
    };

    expect(scrubEvent(event)).toEqual({
      type: undefined,
      message: 'webview_load_failed',
      tags: { status: '502' },
      breadcrumbs: [
        { type: 'http', category: 'fetch', level: 'info', timestamp: 1 },
        { category: 'touch', message: 'Touch event within element: Pressable', timestamp: 2 },
      ],
    });
    expect(event.user?.email).toBe('someone@example.com');
  });

  it('브레드크럼이 없는 이벤트는 그대로 둬야 한다', () => {
    expect(scrubEvent({ type: undefined, message: 'webview_process_terminated' })).toEqual({
      type: undefined,
      message: 'webview_process_terminated',
    });
  });
});
