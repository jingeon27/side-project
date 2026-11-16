import { describe, expect, it } from 'vitest';

import {
  describeLoadFailure,
  describeProcessTermination,
  toCapabilityEvent,
  toDeepLinkEvent,
} from './shell-events';

describe('toCapabilityEvent', () => {
  it('공유 결과를 native_share 이벤트로 바꿔야 한다', () => {
    expect(toCapabilityEvent({ type: 'share', status: 'completed' })).toEqual({
      name: 'native_share_completed',
    });
    expect(toCapabilityEvent({ type: 'share', status: 'dismissed' })).toEqual({
      name: 'native_share_dismissed',
    });
  });
});

describe('toDeepLinkEvent', () => {
  it('초대 토큰과 ID를 뺀 path_template으로 보내야 한다', () => {
    expect(toDeepLinkEvent('/invite/secret_token-1')).toEqual({
      name: 'deep_link_opened',
      properties: { path_template: '/invite/:token' },
    });
    expect(toDeepLinkEvent('/groups/cm1group0001')).toEqual({
      name: 'deep_link_opened',
      properties: { path_template: '/groups/:id' },
    });
    expect(toDeepLinkEvent('/')).toEqual({ name: 'deep_link_opened', properties: { path_template: '/' } });
  });

  it('딥링크 경로가 아니면 보내지 않아야 한다', () => {
    expect(toDeepLinkEvent('/me')).toBeNull();
  });
});

describe('describeLoadFailure', () => {
  it('서버 오류는 HTTP 상태 코드로 기록해야 한다', () => {
    expect(describeLoadFailure({ status: 502 })).toEqual({
      event: { name: 'webview_load_failed', properties: { status: 502 } },
      tags: { status: '502' },
    });
  });

  it('연결 오류는 status 0과 네이티브 오류 코드로 기록해야 한다', () => {
    expect(describeLoadFailure({ status: 0, code: -1009, domain: 'NSURLErrorDomain' })).toEqual({
      event: { name: 'webview_load_failed', properties: { status: 0 } },
      tags: { status: '0', error_code: '-1009', error_domain: 'NSURLErrorDomain' },
    });
    expect(describeLoadFailure({ status: 0, code: -2 }).tags).toEqual({ status: '0', error_code: '-2' });
  });
});

describe('describeProcessTermination', () => {
  it('어느 프로세스가 끝났는지와 Android 크래시 여부를 태그로 남겨야 한다', () => {
    expect(describeProcessTermination({ process: 'content' })).toEqual({
      event: { name: 'webview_process_terminated' },
      tags: { process: 'content' },
    });
    expect(describeProcessTermination({ process: 'render', didCrash: false }).tags).toEqual({
      process: 'render',
      did_crash: 'false',
    });
  });
});
