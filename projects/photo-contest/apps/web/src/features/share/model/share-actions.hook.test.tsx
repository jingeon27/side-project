import type { ReactNode } from 'react';

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NativeCapabilityError, type TNativeCapabilities } from '@photo-contest/bridge/native';
import { installFakeNativeApp, type IFakeNativeApp } from '@photo-contest/bridge/test';
import { createWebBridge, type IWebBridge } from '@photo-contest/bridge/web';

import { BridgeContext } from '@/shared/model/bridge';

import { useShareActions } from './share-actions.hook';

let fake: IFakeNativeApp | undefined;
let bridge: IWebBridge | undefined;

function renderInApp(capabilities: TNativeCapabilities) {
  fake = installFakeNativeApp(window, { capabilities });
  bridge = createWebBridge(window);
  const value = bridge;
  return renderHook(() => useShareActions(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <BridgeContext value={value}>{children}</BridgeContext>
    ),
  });
}

function stubNavigator(name: 'share' | 'clipboard', value: unknown) {
  Object.defineProperty(window.navigator, name, { value, configurable: true });
}

afterEach(() => {
  bridge?.dispose();
  fake?.uninstall();
  bridge = undefined;
  fake = undefined;
  Reflect.deleteProperty(window.navigator, 'share');
  Reflect.deleteProperty(window.navigator, 'clipboard');
});

describe('useShareActions 분석 방법', () => {
  it('앱 공유가 실패해 Web Share로 공유했으면 native가 아니라 web_share로 기록해야 한다', async () => {
    const share = vi.fn(async () => undefined);
    stubNavigator('share', share);
    const { result } = renderInApp({
      'share.open': async () => {
        throw new NativeCapabilityError('FAILED', '공유하지 못했습니다.');
      },
    });

    await expect(
      result.current.share('https://contest.example/invite/a', {}, { copied: '복사' }),
    ).resolves.toBe('web_share');
    expect(share).toHaveBeenCalled();
  });

  it('앱 공유 시트로 공유했으면 native로 기록해야 한다', async () => {
    const { result } = renderInApp({ 'share.open': async () => ({ shared: true }) });
    await expect(
      result.current.share('https://contest.example/invite/a', {}, { copied: '복사' }),
    ).resolves.toBe('native');
  });

  it('앱 복사가 실패해 웹 클립보드로 복사했으면 clipboard로 기록해야 한다', async () => {
    const writeText = vi.fn(async () => undefined);
    stubNavigator('clipboard', { writeText });
    const { result } = renderInApp({
      'clipboard.copy': async () => {
        throw new NativeCapabilityError('FAILED', '복사하지 못했습니다.');
      },
    });

    await expect(result.current.copy('https://contest.example/invite/a', { copied: '복사' })).resolves.toBe(
      'clipboard',
    );
    expect(writeText).toHaveBeenCalledWith('https://contest.example/invite/a');
  });

  it('앱이 복사했으면 native로 기록해야 한다', async () => {
    const { result } = renderInApp({ 'clipboard.copy': async () => ({ copied: true }) });
    await expect(result.current.copy('https://contest.example/invite/a', { copied: '복사' })).resolves.toBe(
      'native',
    );
  });
});
