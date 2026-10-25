import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCapabilities, type ICapabilityDependencies } from './create-capabilities';

function createFakeDependencies(platform: ICapabilityDependencies['platform'] = 'ios') {
  return {
    platform,

    share: vi.fn<ICapabilityDependencies['share']>(async () => ({ action: 'sharedAction' })),
    copyText: vi.fn<ICapabilityDependencies['copyText']>(async () => true),
    impact: vi.fn<ICapabilityDependencies['impact']>(async () => undefined),
    notify: vi.fn<ICapabilityDependencies['notify']>(async () => undefined),
    openBrowser: vi.fn<ICapabilityDependencies['openBrowser']>(async () => ({ type: 'opened' })),

    onOutcome: vi.fn<NonNullable<ICapabilityDependencies['onOutcome']>>(),
  } satisfies ICapabilityDependencies;
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
