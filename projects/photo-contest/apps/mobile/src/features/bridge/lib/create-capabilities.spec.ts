import { createHash, randomBytes } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PROTOCOL_VERSION, type TNativeMessage } from '@photo-contest/bridge';
import { createNativeRouter, NativeCapabilityError } from '@photo-contest/bridge/native';

import { createCapabilities, type ICapabilityDependencies } from './create-capabilities';

const API_BASE = 'https://contest.example/backend';
const CALLBACK_URL = 'https://contest.example/app-auth/callback';
const LOGIN_CODE = 'aGVsbG8td29ybGQtbG9naW4tY29kZQ';

function createFakeDependencies(platform: ICapabilityDependencies['platform'] = 'ios') {
  return {
    platform,
    apiBase: API_BASE,
    authCallbackUrl: CALLBACK_URL,
    share: vi.fn<ICapabilityDependencies['share']>(async () => ({ action: 'sharedAction' })),
    copyText: vi.fn<ICapabilityDependencies['copyText']>(async () => true),
    impact: vi.fn<ICapabilityDependencies['impact']>(async () => undefined),
    notify: vi.fn<ICapabilityDependencies['notify']>(async () => undefined),
    openBrowser: vi.fn<ICapabilityDependencies['openBrowser']>(async () => ({ type: 'opened' })),
    openAuthSession: vi.fn<ICapabilityDependencies['openAuthSession']>(async () => ({
      type: 'success',
      url: `${CALLBACK_URL}?code=${LOGIN_CODE}`,
    })),
    randomBytes: vi.fn<ICapabilityDependencies['randomBytes']>((count) => new Uint8Array(randomBytes(count))),
    sha256: vi.fn<ICapabilityDependencies['sha256']>(
      async (text) => new Uint8Array(createHash('sha256').update(text).digest()),
    ),
    onOutcome: vi.fn<NonNullable<ICapabilityDependencies['onOutcome']>>(),
  } satisfies ICapabilityDependencies;
}

function readChallenge(url: string | undefined) {
  return url?.match(/[?&]app_challenge=([^&]+)/)?.[1];
}

afterEach(() => {
  vi.useRealTimers();
});

describe('share.open', () => {
  it('iOS는 url 필드로 공유하고 결과를 그대로 알려야 한다', async () => {
    const deps = createFakeDependencies();
    const capabilities = createCapabilities(deps);

    await expect(
      capabilities['share.open']({
        url: 'https://contest.example/invite/abc',
        title: '초대',
        text: '같이 해요',
      }),
    ).resolves.toEqual({ shared: true });
    expect(deps.share).toHaveBeenCalledWith(
      { url: 'https://contest.example/invite/abc', title: '초대', message: '같이 해요' },
      { dialogTitle: '초대', subject: '초대' },
    );
  });

  it('Android는 message 한 칸에 문구와 URL을 함께 넣어야 한다', async () => {
    const deps = createFakeDependencies('android');
    const capabilities = createCapabilities(deps);

    await capabilities['share.open']({ url: 'https://contest.example/invite/abc', text: '같이 해요' });
    await capabilities['share.open']({ url: 'https://contest.example/contests/1' });

    expect(deps.share.mock.calls.map(([content]) => content)).toEqual([
      { title: undefined, message: '같이 해요\nhttps://contest.example/invite/abc' },
      { title: undefined, message: 'https://contest.example/contests/1' },
    ]);
  });

  it('공유 시트를 닫으면 shared false여야 한다', async () => {
    const deps = createFakeDependencies();
    deps.share.mockResolvedValue({ action: 'dismissedAction' });
    const capabilities = createCapabilities(deps);

    await expect(capabilities['share.open']({ url: 'https://contest.example/' })).resolves.toEqual({
      shared: false,
    });
  });

  it('공유 결과를 completed 또는 dismissed로 알려야 한다', async () => {
    const deps = createFakeDependencies();
    const capabilities = createCapabilities(deps);

    await capabilities['share.open']({ url: 'https://contest.example/invite/abc' });
    deps.share.mockResolvedValue({ action: 'dismissedAction' });
    await capabilities['share.open']({ url: 'https://contest.example/invite/abc' });

    expect(deps.onOutcome.mock.calls).toEqual([
      [{ type: 'share', status: 'completed' }],
      [{ type: 'share', status: 'dismissed' }],
    ]);
  });
});

describe('clipboard.copy', () => {
  it('복사하고 copied true를 돌려줘야 한다', async () => {
    const deps = createFakeDependencies();

    await expect(createCapabilities(deps)['clipboard.copy']({ text: '초대 링크' })).resolves.toEqual({
      copied: true,
    });
    expect(deps.copyText).toHaveBeenCalledWith('초대 링크');
  });

  it('복사에 실패하면 FAILED로 알려야 한다', async () => {
    const deps = createFakeDependencies();
    deps.copyText.mockResolvedValue(false);
    const capabilities = createCapabilities(deps);

    await expect(capabilities['clipboard.copy']({ text: 'x' })).rejects.toMatchObject({
      code: 'FAILED',
      message: '복사하지 못했습니다.',
    });
  });
});

describe('haptics.impact', () => {
  it('세기는 impact, 결과는 notification 진동으로 나눠야 한다', async () => {
    const deps = createFakeDependencies();
    const capabilities = createCapabilities(deps);

    for (const style of ['light', 'medium', 'heavy', 'success', 'warning', 'error'] as const) {
      await expect(capabilities['haptics.impact']({ style })).resolves.toEqual({});
    }

    expect(deps.impact.mock.calls).toEqual([['light'], ['medium'], ['heavy']]);
    expect(deps.notify.mock.calls).toEqual([['success'], ['warning'], ['error']]);
  });
});

describe('link.open', () => {
  it('브라우저를 열면 opened true여야 한다', async () => {
    const deps = createFakeDependencies();

    await expect(
      createCapabilities(deps)['link.open']({ url: 'https://help.example/terms' }),
    ).resolves.toEqual({
      opened: true,
    });
    expect(deps.openBrowser).toHaveBeenCalledWith('https://help.example/terms');
  });

  it('iOS처럼 브라우저가 닫힐 때까지 끝나지 않아도 곧바로 답해야 한다', async () => {
    vi.useFakeTimers();
    const deps = createFakeDependencies();
    deps.openBrowser.mockReturnValue(new Promise(() => undefined));
    const capabilities = createCapabilities(deps);

    const result = capabilities['link.open']({ url: 'https://help.example/terms' });
    await vi.advanceTimersByTimeAsync(300);

    await expect(result).resolves.toEqual({ opened: true });
  });

  it('다른 브라우저가 이미 열려 있으면 opened false여야 한다', async () => {
    const deps = createFakeDependencies();
    deps.openBrowser.mockResolvedValue({ type: 'locked' });
    const capabilities = createCapabilities(deps);

    await expect(capabilities['link.open']({ url: 'https://help.example/' })).resolves.toEqual({
      opened: false,
    });
  });

  it('브라우저를 열지 못하면 거부해야 한다', async () => {
    const deps = createFakeDependencies();
    deps.openBrowser.mockRejectedValue(new Error('no browser'));
    const capabilities = createCapabilities(deps);

    await expect(capabilities['link.open']({ url: 'https://help.example/' })).rejects.toThrow('no browser');
  });
});

describe('auth.socialLogin', () => {
  it('verifier의 S256 challenge로 인증 세션을 열고 code와 verifier를 돌려줘야 한다', async () => {
    const deps = createFakeDependencies();

    const result = await createCapabilities(deps)['auth.socialLogin']({ provider: 'google' });

    expect(result.code).toBe(LOGIN_CODE);
    expect(result.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(deps.randomBytes).toHaveBeenCalledWith(32);
    const [authUrl, redirectUrl] = deps.openAuthSession.mock.calls[0] ?? [];
    expect(authUrl).toMatch(
      /^https:\/\/contest\.example\/backend\/auth\/google\?app_challenge=[A-Za-z0-9_-]{43}$/,
    );
    expect(readChallenge(authUrl)).toBe(createHash('sha256').update(result.verifier).digest('base64url'));
    expect(redirectUrl).toBe(CALLBACK_URL);
  });

  it('요청마다 새 verifier를 만들고 provider 경로를 따라야 한다', async () => {
    const deps = createFakeDependencies();
    const capabilities = createCapabilities(deps);

    const first = await capabilities['auth.socialLogin']({ provider: 'kakao' });
    const second = await capabilities['auth.socialLogin']({ provider: 'kakao' });

    expect(first.verifier).not.toBe(second.verifier);
    expect(deps.openAuthSession.mock.calls[0]?.[0]).toMatch(/\/backend\/auth\/kakao\?app_challenge=/);
  });

  it('사용자가 닫으면 CANCELLED여야 한다', async () => {
    for (const type of ['cancel', 'dismiss']) {
      const deps = createFakeDependencies();
      deps.openAuthSession.mockResolvedValue({ type });
      const capabilities = createCapabilities(deps);

      const login = capabilities['auth.socialLogin']({ provider: 'google' });

      await expect(login).rejects.toBeInstanceOf(NativeCapabilityError);
      await expect(login).rejects.toMatchObject({ code: 'CANCELLED', message: '로그인을 취소했습니다.' });
    }
  });

  it('서버가 실패를 돌려주면 FAILED여야 한다', async () => {
    const deps = createFakeDependencies();
    deps.openAuthSession.mockResolvedValue({ type: 'success', url: `${CALLBACK_URL}?error=login_failed` });
    const capabilities = createCapabilities(deps);

    await expect(capabilities['auth.socialLogin']({ provider: 'google' })).rejects.toMatchObject({
      code: 'FAILED',
      message: '소셜 로그인에 실패했습니다.',
    });
  });

  it('콜백 형식이 틀리거나 세션을 열지 못하면 FAILED여야 한다', async () => {
    const results = [
      { type: 'success', url: `${CALLBACK_URL}?code=short` },
      { type: 'success', url: `photocontest://groups/1?code=${LOGIN_CODE}` },
      { type: 'success', url: `photocontest://auth/callback?code=${LOGIN_CODE}` },
      { type: 'success', url: `https://evil.example/app-auth/callback?code=${LOGIN_CODE}` },
      { type: 'success' },
      { type: 'locked' },
    ];
    for (const result of results) {
      const deps = createFakeDependencies();
      deps.openAuthSession.mockResolvedValue(result);
      const capabilities = createCapabilities(deps);
      await expect(capabilities['auth.socialLogin']({ provider: 'google' })).rejects.toMatchObject({
        code: 'FAILED',
      });
    }

    const throwingDeps = createFakeDependencies();
    throwingDeps.openAuthSession.mockRejectedValue(new Error('already open'));
    const throwing = createCapabilities(throwingDeps);
    await expect(throwing['auth.socialLogin']({ provider: 'google' })).rejects.toMatchObject({
      code: 'FAILED',
      message: '소셜 로그인에 실패했습니다.',
    });
  });

  it('진행 중에 다시 요청하면 두 번째는 CANCELLED로 무시하고, 끝나면 다시 받아야 한다', async () => {
    let finish: (value: { type: string; url?: string }) => void = () => undefined;
    const deps = createFakeDependencies();
    deps.openAuthSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const capabilities = createCapabilities(deps);

    const first = capabilities['auth.socialLogin']({ provider: 'google' });
    await expect(capabilities['auth.socialLogin']({ provider: 'google' })).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    await vi.waitFor(() => expect(deps.openAuthSession).toHaveBeenCalledTimes(1));
    finish({ type: 'success', url: `${CALLBACK_URL}?code=${LOGIN_CODE}` });

    await expect(first).resolves.toMatchObject({ code: LOGIN_CODE });
    deps.openAuthSession.mockResolvedValueOnce({ type: 'cancel' });
    await expect(capabilities['auth.socialLogin']({ provider: 'google' })).rejects.toMatchObject({
      code: 'CANCELLED',
      message: '로그인을 취소했습니다.',
    });
  });
});

describe('auth.socialLogin 결과 기록', () => {
  it('시작과 결과(성공·취소·실패)를 provider와 함께 알려야 한다', async () => {
    const deps = createFakeDependencies();
    const capabilities = createCapabilities(deps);

    await capabilities['auth.socialLogin']({ provider: 'kakao' });
    deps.openAuthSession.mockResolvedValueOnce({ type: 'dismiss' });
    await capabilities['auth.socialLogin']({ provider: 'google' }).catch(() => undefined);
    deps.openAuthSession.mockResolvedValueOnce({
      type: 'success',
      url: `${CALLBACK_URL}?error=login_failed`,
    });
    await capabilities['auth.socialLogin']({ provider: 'google' }).catch(() => undefined);
    deps.openAuthSession.mockRejectedValueOnce(new Error('already open'));
    await capabilities['auth.socialLogin']({ provider: 'kakao' }).catch(() => undefined);

    expect(deps.onOutcome.mock.calls.map(([outcome]) => outcome)).toEqual([
      { type: 'social-login', provider: 'kakao', status: 'started' },
      { type: 'social-login', provider: 'kakao', status: 'succeeded' },
      { type: 'social-login', provider: 'google', status: 'started' },
      { type: 'social-login', provider: 'google', status: 'cancelled' },
      { type: 'social-login', provider: 'google', status: 'started' },
      { type: 'social-login', provider: 'google', status: 'failed' },
      { type: 'social-login', provider: 'kakao', status: 'started' },
      { type: 'social-login', provider: 'kakao', status: 'failed' },
    ]);
  });

  it('진행 중에 다시 눌러 무시한 요청은 새 시도로 기록하지 않아야 한다', async () => {
    let finish: (value: { type: string; url?: string }) => void = () => undefined;
    const deps = createFakeDependencies();
    deps.openAuthSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const capabilities = createCapabilities(deps);

    const first = capabilities['auth.socialLogin']({ provider: 'google' });
    await capabilities['auth.socialLogin']({ provider: 'google' }).catch(() => undefined);
    await vi.waitFor(() => expect(deps.openAuthSession).toHaveBeenCalledTimes(1));
    finish({ type: 'success', url: `${CALLBACK_URL}?code=${LOGIN_CODE}` });
    await first;

    expect(deps.onOutcome.mock.calls.map(([outcome]) => outcome.status)).toEqual(['started', 'succeeded']);
  });

  it('결과를 기록하다 실패해도 웹에 보낼 결과는 그대로여야 한다', async () => {
    const deps = createFakeDependencies();
    deps.onOutcome.mockImplementation(() => {
      throw new Error('analytics unavailable');
    });
    const capabilities = createCapabilities(deps);

    await expect(capabilities['auth.socialLogin']({ provider: 'google' })).resolves.toMatchObject({
      code: LOGIN_CODE,
    });
    await expect(capabilities['share.open']({ url: 'https://contest.example/' })).resolves.toEqual({
      shared: true,
    });
  });
});

describe('브리지 라우터 연결', () => {
  it('웹 요청을 기능으로 처리하고 결과와 오류 코드를 응답해야 한다', async () => {
    const sent: TNativeMessage[] = [];
    const deps = createFakeDependencies();
    deps.openAuthSession.mockResolvedValue({ type: 'cancel' });
    const router = createNativeRouter({
      allowedOrigin: 'https://contest.example',
      capabilities: createCapabilities(deps),
      send: (message) => sent.push(message),
    });

    await router.handleMessage(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 'copy-1',
        type: 'clipboard.copy',
        payload: { text: 'hi' },
      }),
      'https://contest.example/groups/1',
    );
    await router.handleMessage(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 'login-1',
        type: 'auth.socialLogin',
        payload: { provider: 'google' },
      }),
      'https://contest.example/',
    );

    expect(sent).toEqual([
      { v: PROTOCOL_VERSION, kind: 'response', id: 'copy-1', ok: true, result: { copied: true } },
      {
        v: PROTOCOL_VERSION,
        kind: 'response',
        id: 'login-1',
        ok: false,
        error: { code: 'CANCELLED', message: '로그인을 취소했습니다.' },
      },
    ]);
  });
});
