import { describe, expect, it, vi } from 'vitest';

import { NativeCapabilityError } from '@photo-contest/bridge/native';

import { decideBackPress, resolveBackPress } from './back-press';

describe('decideBackPress', () => {
  it('웹이 처리했으면 아무것도 하지 않아야 한다', () => {
    expect(decideBackPress({ webHandled: true, canGoBack: true })).toBe('none');
    expect(decideBackPress({ webHandled: true, canGoBack: false })).toBe('none');
  });

  it('웹이 처리하지 않았으면 WebView 기록으로 돌아가고, 기록이 없으면 앱을 닫아야 한다', () => {
    expect(decideBackPress({ webHandled: false, canGoBack: true })).toBe('go-back');
    expect(decideBackPress({ webHandled: false, canGoBack: false })).toBe('exit');
  });
});

describe('resolveBackPress', () => {
  it('웹 응답을 따라야 한다', async () => {
    await expect(
      resolveBackPress(
        async () => ({ handled: true }),
        () => true,
      ),
    ).resolves.toBe('none');
    await expect(
      resolveBackPress(
        async () => ({ handled: false }),
        () => true,
      ),
    ).resolves.toBe('go-back');
    await expect(
      resolveBackPress(
        async () => ({ handled: false }),
        () => false,
      ),
    ).resolves.toBe('exit');
  });

  it('웹이 시간 안에 답하지 않거나 실패하면 처리하지 않은 것으로 봐야 한다', async () => {
    const timeout = async () => {
      throw new NativeCapabilityError('TIMEOUT', '웹이 응답하지 않습니다.');
    };

    await expect(resolveBackPress(timeout, () => true)).resolves.toBe('go-back');
    await expect(resolveBackPress(timeout, () => false)).resolves.toBe('exit');
  });

  it('웹 응답을 받은 뒤의 기록 상태로 판단해야 한다', async () => {
    let canGoBack = true;
    const canGoBackReader = vi.fn(() => canGoBack);

    const action = resolveBackPress(async () => {
      canGoBack = false;
      return { handled: false };
    }, canGoBackReader);

    await expect(action).resolves.toBe('exit');
    expect(canGoBackReader).toHaveBeenCalledTimes(1);
  });
});
