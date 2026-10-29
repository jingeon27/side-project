// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_MARKER_KEY, NATIVE_EVENT_NAME } from './protocol';
import { installFakeNativeApp, type IFakeNativeApp } from './test';
import { BridgeError, createWebBridge, readNativeAppInfo, type IWebBridge, type TBridgeWindow } from './web';

let fake: IFakeNativeApp | undefined;
let bridge: IWebBridge | undefined;

afterEach(() => {
  bridge?.dispose();
  fake?.uninstall();
  bridge = undefined;
  fake = undefined;
  vi.useRealTimers();
});

describe('readNativeAppInfo', () => {
  it('브라우저에서는 null이어야 한다', () => {
    expect(readNativeAppInfo(window)).toBeNull();
  });

  it('앱 표식만 있고 ReactNativeWebView가 없으면 앱으로 보지 않아야 한다', () => {
    const win: TBridgeWindow = window;
    win[APP_MARKER_KEY] = { platform: 'ios', appVersion: '1.0.0', protocolVersion: 1, capabilities: [] };
    expect(readNativeAppInfo(win)).toBeNull();
    delete win[APP_MARKER_KEY];
  });
});

describe('createWebBridge', () => {
  it('브라우저에서는 요청을 UNSUPPORTED로 거절하고 알림은 무시해야 한다', async () => {
    bridge = createWebBridge(window);
    expect(bridge.app).toBeNull();
    expect(bridge.supports('share.open')).toBe(false);
    await expect(bridge.request('clipboard.copy', { text: 'a' })).rejects.toMatchObject({
      code: 'UNSUPPORTED',
    });
    expect(() => bridge?.notify('app.ready', { path: '/' })).not.toThrow();
  });

  it('앱 기능을 요청하고 검증된 결과를 받아야 한다', async () => {
    fake = installFakeNativeApp(window, { capabilities: { 'share.open': async () => ({ shared: true }) } });
    bridge = createWebBridge(window);
    expect(bridge.app?.platform).toBe('ios');
    expect(bridge.supports('share.open')).toBe(true);
    expect(bridge.supports('clipboard.copy')).toBe(false);
    await expect(
      bridge.request('share.open', { url: 'http://localhost:3000/invite/a', title: '초대' }),
    ).resolves.toEqual({
      shared: true,
    });
    expect(fake.calls).toEqual([
      { type: 'share.open', payload: { url: 'http://localhost:3000/invite/a', title: '초대' } },
    ]);
  });

  it('앱이 지원 목록에 없는 기능은 보내지 않아야 한다', async () => {
    fake = installFakeNativeApp(window, { capabilities: { 'share.open': async () => ({ shared: true }) } });
    bridge = createWebBridge(window);
    await expect(bridge.request('haptics.impact', { style: 'light' })).rejects.toBeInstanceOf(BridgeError);
    expect(fake.calls).toEqual([]);
  });

  it('앱 오류 코드를 그대로 전달해야 한다', async () => {
    fake = installFakeNativeApp(window, {
      capabilities: {
        'share.open': async () => {
          const { NativeCapabilityError } = await import('./native');
          throw new NativeCapabilityError('CANCELLED', '공유를 취소했습니다.');
        },
      },
    });
    bridge = createWebBridge(window);
    await expect(bridge.request('share.open', { url: 'https://contest.example/' })).rejects.toMatchObject({
      code: 'CANCELLED',
      message: '공유를 취소했습니다.',
    });
  });

  it('앱이 응답하지 않으면 TIMEOUT으로 끝나야 한다', async () => {
    vi.useFakeTimers();
    fake = installFakeNativeApp(window, {
      capabilities: { 'clipboard.copy': () => new Promise<never>(() => undefined) },
    });
    bridge = createWebBridge(window);
    const result = bridge.request('clipboard.copy', { text: '링크' }, { timeoutMs: 50 });
    vi.advanceTimersByTime(50);
    await expect(result).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('앱의 뒤로 가기 요청에 등록한 처리기로 답해야 한다', async () => {
    fake = installFakeNativeApp(window, { capabilities: {} });
    bridge = createWebBridge(window);
    const handler = vi.fn(() => ({ handled: true }));
    bridge.handleRequest('navigation.back', handler);
    await expect(fake.router.requestWeb('navigation.back', {})).resolves.toEqual({ handled: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('처리기가 없으면 앱이 기본 동작을 하도록 UNSUPPORTED로 답해야 한다', async () => {
    fake = installFakeNativeApp(window, { capabilities: {} });
    bridge = createWebBridge(window);
    await expect(fake.router.requestWeb('navigation.back', {})).rejects.toMatchObject({
      code: 'UNSUPPORTED',
    });
  });

  it('앱 상태 알림을 구독자에게 전달하고 해제 후에는 전달하지 않아야 한다', () => {
    fake = installFakeNativeApp(window, { capabilities: {} });
    bridge = createWebBridge(window);
    const listener = vi.fn();
    const unsubscribe = bridge.onEvent('app.state', listener);
    fake.router.emit('app.state', { state: 'active' });
    unsubscribe();
    fake.router.emit('app.state', { state: 'background' });
    expect(listener.mock.calls).toEqual([[{ state: 'active' }]]);
  });

  it('형식이 틀린 앱 메시지는 무시해야 한다', () => {
    fake = installFakeNativeApp(window, { capabilities: {} });
    bridge = createWebBridge(window);
    const listener = vi.fn();
    bridge.onEvent('app.state', listener);
    window.dispatchEvent(
      new CustomEvent(NATIVE_EVENT_NAME, { detail: '{"v":1,"kind":"event","type":"app.state"}' }),
    );
    window.dispatchEvent(new CustomEvent(NATIVE_EVENT_NAME, { detail: { not: 'a string' } }));
    expect(listener).not.toHaveBeenCalled();
  });

  it('dispose 하면 기다리던 요청을 취소해야 한다', async () => {
    fake = installFakeNativeApp(window, {
      capabilities: { 'share.open': () => new Promise<never>(() => undefined) },
    });
    bridge = createWebBridge(window);
    const result = bridge.request('share.open', { url: 'http://localhost:3000/' });
    bridge.dispose();
    await expect(result).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});
