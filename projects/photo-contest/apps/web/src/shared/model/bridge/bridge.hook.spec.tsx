import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';

import { render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFakeNativeApp, type IFakeNativeApp } from '@photo-contest/bridge/test';
import { createWebBridge, type IWebBridge } from '@photo-contest/bridge/web';

import { BridgeContext, useNativeApp } from './bridge.hook';
import { useHaptics } from './haptics.hook';
import { SHARE_OUTCOME } from './share-link.helper';
import { useShareLink } from './share-link.hook';

let fake: IFakeNativeApp | undefined;
let bridge: IWebBridge | undefined;

afterEach(() => {
  bridge?.dispose();
  fake?.uninstall();
  bridge = undefined;
  fake = undefined;
});

let providedBridge: IWebBridge | null = null;

function BridgeWrapper({ children }: { children: ReactNode }) {
  return <BridgeContext value={providedBridge}>{children}</BridgeContext>;
}

/** renderHook·render의 wrapper로 넘길 Provider. 넘긴 브리지를 컨텍스트에 넣는다. */
function withBridge(value: IWebBridge | null) {
  providedBridge = value;
  return BridgeWrapper;
}

function AppVersion() {
  const app = useNativeApp();
  return <p>{app ? `앱 ${app.appVersion}` : '웹'}</p>;
}

describe('useNativeApp', () => {
  it('서버 렌더링에서는 앱 안이어도 웹 화면을 그려 hydration이 어긋나지 않아야 한다', () => {
    fake = installFakeNativeApp(window, { capabilities: {}, appVersion: '1.2.3' });
    bridge = createWebBridge(window);
    expect(
      renderToString(
        <BridgeContext value={bridge}>
          <AppVersion />
        </BridgeContext>,
      ),
    ).toContain('웹');
  });

  it('브라우저에서는 앱 정보를, 앱 밖이면 null을 돌려줘야 한다', () => {
    fake = installFakeNativeApp(window, { capabilities: {}, appVersion: '1.2.3', platform: 'android' });
    bridge = createWebBridge(window);
    render(<AppVersion />, { wrapper: withBridge(bridge) });
    expect(screen.getByText('앱 1.2.3')).toBeInTheDocument();

    const { result } = renderHook(() => useNativeApp(), { wrapper: withBridge(null) });
    expect(result.current).toBeNull();
  });
});

describe('useShareLink', () => {
  it('컨텍스트의 앱 브리지로 공유해야 한다', async () => {
    fake = installFakeNativeApp(window, { capabilities: { 'share.open': async () => ({ shared: true }) } });
    bridge = createWebBridge(window);
    const { result } = renderHook(() => useShareLink(), { wrapper: withBridge(bridge) });
    await expect(result.current.share('http://localhost:3000/contests/c1', { title: '결과' })).resolves.toBe(
      SHARE_OUTCOME.Shared,
    );
    expect(fake.calls).toEqual([
      { type: 'share.open', payload: { url: 'http://localhost:3000/contests/c1', title: '결과' } },
    ]);
  });
});

describe('useHaptics', () => {
  it('앱이 지원할 때만 진동을 요청하고 브라우저에서는 아무것도 하지 않아야 한다', async () => {
    const impact = vi.fn(async () => ({}));
    fake = installFakeNativeApp(window, { capabilities: { 'haptics.impact': impact } });
    bridge = createWebBridge(window);
    const { result } = renderHook(() => useHaptics(), { wrapper: withBridge(bridge) });
    result.current.impact();
    await vi.waitFor(() => expect(impact).toHaveBeenCalledWith({ style: 'light' }));

    const browser = renderHook(() => useHaptics(), { wrapper: withBridge(null) });
    expect(() => browser.result.current.impact('medium')).not.toThrow();
  });
});
