import { describe, expect, it } from 'vitest';

import {
  PROTOCOL_VERSION,
  buildAppUserAgent,
  decodeNativeMessage,
  decodeWebMessage,
  originOf,
  parseAppUserAgent,
  parseNativeAppInfo,
  readRequestId,
} from './protocol';

function encode(value: unknown) {
  return JSON.stringify(value);
}

describe('decodeWebMessage', () => {
  it('앱 외부 브라우저로 긴 presigned 주소를 보내고 8KB를 넘는 주소는 거부해야 한다', () => {
    const request = (url: string) =>
      encode({
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 'signed-download',
        type: 'link.open',
        payload: { url },
      });
    const url = 'https://storage.example/object?X-Amz-Security-Token=' + 'a'.repeat(3000);
    expect(decodeWebMessage(request(url))).toMatchObject({ type: 'link.open', payload: { url } });
    expect(decodeWebMessage(request('https://storage.example/' + 'a'.repeat(8192)))).toBeNull();
  });
  it('알려진 요청을 본문 검증 후 돌려줘야 한다', () => {
    const message = decodeWebMessage(
      encode({
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 'a1',
        type: 'share.open',
        payload: { url: 'https://contest.example/invite/abc', title: '초대' },
      }),
    );
    expect(message).toEqual({
      v: 1,
      kind: 'request',
      id: 'a1',
      type: 'share.open',
      payload: { url: 'https://contest.example/invite/abc', title: '초대' },
    });
  });

  it('http(s)가 아닌 링크와 모르는 요청 종류를 거부해야 한다', () => {
    const base = { v: PROTOCOL_VERSION, kind: 'request', id: 'a2' };
    expect(
      decodeWebMessage(encode({ ...base, type: 'link.open', payload: { url: 'javascript:alert(1)' } })),
    ).toBeNull();
    expect(
      decodeWebMessage(encode({ ...base, type: 'link.open', payload: { url: 'intent://x#Intent;end' } })),
    ).toBeNull();
    expect(decodeWebMessage(encode({ ...base, type: 'fs.read', payload: {} }))).toBeNull();
  });

  it('다른 프로토콜 버전과 JSON이 아닌 문자열을 거부해야 한다', () => {
    expect(
      decodeWebMessage(encode({ v: 99, kind: 'event', type: 'app.ready', payload: { path: '/' } })),
    ).toBeNull();
    expect(decodeWebMessage('{not json')).toBeNull();
    expect(decodeWebMessage({ v: 1 })).toBeNull();
  });

  it('너무 긴 본문을 거부해야 한다', () => {
    const text = 'a'.repeat(2001);
    expect(
      decodeWebMessage(
        encode({ v: 1, kind: 'request', id: 'a3', type: 'clipboard.copy', payload: { text } }),
      ),
    ).toBeNull();
    expect(decodeWebMessage('x'.repeat(20_001))).toBeNull();
  });

  it('소셜 로그인 결과의 verifier 형식을 검사해야 한다', () => {
    const verifier = 'v'.repeat(43);
    const ok = decodeWebMessage(
      encode({ v: 1, kind: 'response', id: 'a4', ok: true, result: { code: 'c'.repeat(16), verifier } }),
    );
    expect(ok?.kind).toBe('response');
  });
});

describe('decodeNativeMessage', () => {
  it('앱의 뒤로 가기 요청과 앱 상태 알림을 읽어야 한다', () => {
    expect(
      decodeNativeMessage(encode({ v: 1, kind: 'request', id: 'n1', type: 'navigation.back', payload: {} }))
        ?.kind,
    ).toBe('request');
    expect(
      decodeNativeMessage(encode({ v: 1, kind: 'event', type: 'app.state', payload: { state: 'active' } })),
    ).toEqual({ v: 1, kind: 'event', type: 'app.state', payload: { state: 'active' } });
  });

  it('웹 전용 요청을 앱 메시지로 받아들이지 않아야 한다', () => {
    expect(
      decodeNativeMessage(
        encode({
          v: 1,
          kind: 'request',
          id: 'n2',
          type: 'share.open',
          payload: { url: 'https://a.example' },
        }),
      ),
    ).toBeNull();
  });
});

describe('readRequestId', () => {
  it('본문이 틀린 요청에서도 id를 꺼내야 한다', () => {
    expect(readRequestId(encode({ v: 1, kind: 'request', id: 'r1', type: 'nope' }))).toBe('r1');
    expect(readRequestId(encode({ v: 1, kind: 'event', id: 'r2' }))).toBeNull();
  });
});

describe('originOf', () => {
  it('포트를 포함한 origin을 소문자로 돌려줘야 한다', () => {
    expect(originOf('HTTP://LocalHost:3200/groups/1?x=1')).toBe('http://localhost:3200');
    expect(originOf('https://contest.example')).toBe('https://contest.example');
  });

  it('사용자 정보가 섞이거나 http(s)가 아닌 URL은 null이어야 한다', () => {
    expect(originOf('https://evil.example@contest.example/')).toBeNull();
    expect(originOf('file:///etc/passwd')).toBeNull();
    expect(originOf('about:blank')).toBeNull();
  });
});

describe('parseAppUserAgent', () => {
  it('앱 토큰이 있을 때만 버전을 읽어야 한다', () => {
    expect(parseAppUserAgent(`Mozilla/5.0 (iPhone) ${buildAppUserAgent('1.2.3')}`)).toEqual({
      appVersion: '1.2.3',
    });
    expect(parseAppUserAgent('Mozilla/5.0 (iPhone) Safari/605.1')).toBeNull();
    expect(parseAppUserAgent(undefined)).toBeNull();
  });
});

describe('navigation.open', () => {
  function open(path: string) {
    return decodeNativeMessage(encode({ v: 1, kind: 'event', type: 'navigation.open', payload: { path } }));
  }

  it('같은 origin의 상대 경로만 받아들여야 한다', () => {
    expect(open('/invite/abc?from=kakao')?.kind).toBe('event');
    expect(open('/')?.kind).toBe('event');
  });

  it('다른 origin으로 새는 경로를 거부해야 한다', () => {
    expect(open('//evil.example/x')).toBeNull();
    expect(open('/\\evil.example')).toBeNull();
    expect(open('https://evil.example/')).toBeNull();
    expect(open('javascript:alert(1)')).toBeNull();
    expect(open('groups/1')).toBeNull();
  });
});

describe('선택 필드 호환성', () => {
  it('auth.changed의 userId와 앱 정보의 analyticsDeviceId는 없어도 받아들여야 한다', () => {
    expect(
      decodeWebMessage(encode({ v: 1, kind: 'event', type: 'auth.changed', payload: { signedIn: false } })),
    ).toMatchObject({ payload: { signedIn: false } });
    expect(
      decodeWebMessage(
        encode({ v: 1, kind: 'event', type: 'auth.changed', payload: { signedIn: true, userId: 'ckuser1' } }),
      ),
    ).toMatchObject({ payload: { signedIn: true, userId: 'ckuser1' } });
    expect(
      parseNativeAppInfo({ platform: 'ios', appVersion: '1.0.0', protocolVersion: 1, capabilities: [] }),
    ).not.toBeNull();
    expect(
      parseNativeAppInfo({
        platform: 'android',
        appVersion: '1.0.0',
        protocolVersion: 1,
        capabilities: [],
        analyticsDeviceId: 'device-123',
      })?.analyticsDeviceId,
    ).toBe('device-123');
  });
});
