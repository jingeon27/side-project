import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildBootstrapScript, buildDispatchScript, parseNativeMessage } from '@game-feedback/bridge';

import { NativeHost } from './native-host';

const origin = 'https://feedback.example';
function setup() {
  const send = vi.fn();
  const login = vi.fn(async () => ({ status: 'cancelled' as const }));
  const onLocation = vi.fn();
  const host = new NativeHost({ origin, send, login, onLocation });
  const receive = (message: unknown, source = `${origin}/ko`) =>
    host.receive(JSON.stringify(message), source);
  return { host, send, login, onLocation, receive };
}
afterEach(() => vi.useRealTimers());
describe('native bridge boundary', () => {
  it('reports overlay gestures and exits only for a matching root-back response', async () => {
    const onOverlayChange = vi.fn();
    const onRootBack = vi.fn();
    const send = vi.fn();
    const host = new NativeHost({
      origin,
      send,
      login: async () => ({ status: 'cancelled' }),
      onLocation: vi.fn(),
      onOverlayChange,
      onRootBack,
    });
    const receive = (message: unknown) => host.receive(JSON.stringify(message), `${origin}/ko`);
    receive({ type: 'ready' });
    receive({ type: 'navigation-state', overlayOpen: true });
    expect(onOverlayChange).toHaveBeenLastCalledWith(true);
    const back = host.back();
    receive({ type: 'back-result', id: 'wrong', handled: false, atRoot: true });
    expect(onRootBack).not.toHaveBeenCalled();
    receive({ type: 'back-result', id: send.mock.calls.at(-1)?.[0].id, handled: false, atRoot: true });
    expect(await back).toBe(true);
    expect(onRootBack).toHaveBeenCalledOnce();
    host.reset();
    expect(onOverlayChange).toHaveBeenLastCalledWith(false);
  });
  it('ignores untrusted frames, malformed envelopes and unsafe paths', () => {
    const ctx = setup();
    ctx.receive({ type: 'auth-request', id: 'x' }, `${origin}.evil/ko`);
    ctx.receive({ type: 'auth-request', id: 'x' }, 'about:blank');
    ctx.receive({ type: 'location', path: 'javascript:alert(1)' });
    ctx.host.receive('invalid-json', `${origin}/ko`);
    expect(ctx.login).not.toHaveBeenCalled();
    expect(ctx.onLocation).not.toHaveBeenCalled();
    ctx.receive({ type: 'location', path: '/ko/posts/abc' });
    expect(ctx.onLocation).toHaveBeenCalledWith('/ko/posts/abc');
    expect(parseNativeMessage({ type: 'open', path: '//evil.example' })).toBeNull();
  });
  it('waits for web readiness and matches back responses by request ID', async () => {
    const { host, receive, send } = setup();
    expect(host.open('/ko/settings')).toBe(false);
    expect(await host.back()).toBe(false);
    receive({ type: 'ready' });
    expect(host.open('/ko/settings')).toBe(true);
    const result = host.back();
    const message = send.mock.calls.at(-1)?.[0];
    receive({ type: 'back-result', id: 'wrong-id', handled: true });
    receive({ type: 'back-result', id: message.id, handled: true });
    expect(await result).toBe(true);
  });
  it('bounds back waits and clears pending requests when the document is replaced', async () => {
    vi.useFakeTimers();
    const { host, receive } = setup();
    receive({ type: 'ready' });
    const timed = host.back();
    await vi.advanceTimersByTimeAsync(800);
    expect(await timed).toBe(false);
    const cancelled = host.back();
    host.reset();
    expect(await cancelled).toBe(true);
    expect(host.open('/ko')).toBe(false);
  });
  it('serializes native auth and discards results from replaced documents', async () => {
    const { host, receive, send, login } = setup();
    const pending = Promise.withResolvers<{ status: 'cancelled' }>();
    login.mockImplementation(() => pending.promise);
    receive({ type: 'auth-request', id: 'a' });
    receive({ type: 'auth-request', id: 'b' });
    expect(login).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ type: 'auth-result', id: 'b', status: 'cancelled' });
    host.reset();
    pending.resolve({ status: 'cancelled' });
    await Promise.resolve();
    await Promise.resolve();
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });
  it('escapes bootstrap metadata and emits structured messages', () => {
    expect(buildBootstrapScript('1.0.0')).toContain('__GAME_FEEDBACK_APP__');
    expect(buildDispatchScript({ type: 'open', path: '/ko' })).toContain('game-feedback:native');
  });
});
