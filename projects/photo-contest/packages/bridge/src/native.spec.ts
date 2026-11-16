import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildBootstrapScript,
  buildNativeDispatchScript,
  createNativeRouter,
  NativeCapabilityError,
  type TNativeCapabilities,
} from './native';
import { APP_MARKER_KEY, NATIVE_EVENT_NAME, PROTOCOL_VERSION, type TNativeMessage } from './protocol';

const ORIGIN = 'https://contest.example';

function setup(capabilities: TNativeCapabilities = {}) {
  const sent: TNativeMessage[] = [];
  const onReady = vi.fn();
  const router = createNativeRouter({
    allowedOrigin: ORIGIN,
    capabilities,
    send: (message) => sent.push(message),
    onEvent: { 'app.ready': onReady },
  });
  return { router, sent, onReady };
}

function request(id: string, type: string, payload: unknown) {
  return JSON.stringify({ v: PROTOCOL_VERSION, kind: 'request', id, type, payload });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createNativeRouter', () => {
  it('허용한 origin의 요청만 기능으로 보내야 한다', async () => {
    const share = vi.fn(async () => ({ shared: true }));
    const { router, sent } = setup({ 'share.open': share });
    await router.handleMessage(
      request('1', 'share.open', { url: `${ORIGIN}/invite/a` }),
      'https://evil.example/',
    );
    expect(share).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
    await router.handleMessage(
      request('2', 'share.open', { url: `${ORIGIN}/invite/a` }),
      `${ORIGIN}/groups/1`,
    );
    expect(share).toHaveBeenCalledWith({ url: `${ORIGIN}/invite/a` });
    expect(sent).toEqual([{ v: 1, kind: 'response', id: '2', ok: true, result: { shared: true } }]);
  });

  it('구현하지 않은 기능은 UNSUPPORTED로 답해야 한다', async () => {
    const { router, sent } = setup();
    await router.handleMessage(request('3', 'haptics.impact', { style: 'light' }), ORIGIN);
    expect(sent[0]).toMatchObject({ id: '3', ok: false, error: { code: 'UNSUPPORTED' } });
  });

  it('본문이 틀린 요청은 기능을 부르지 않고 INVALID로 답해야 한다', async () => {
    const open = vi.fn(async () => ({ opened: true }));
    const { router, sent } = setup({ 'link.open': open });
    await router.handleMessage(request('4', 'link.open', { url: 'javascript:alert(1)' }), ORIGIN);
    expect(open).not.toHaveBeenCalled();
    expect(sent[0]).toMatchObject({ id: '4', ok: false, error: { code: 'INVALID' } });
  });

  it('사용자가 취소하면 CANCELLED, 그 밖의 실패는 내부 메시지 없이 FAILED로 답해야 한다', async () => {
    const { router, sent } = setup({
      'share.open': async () => {
        throw new NativeCapabilityError('CANCELLED', '공유를 취소했습니다.');
      },
      'clipboard.copy': async () => {
        throw new Error('native module crashed: secret detail');
      },
    });
    await router.handleMessage(request('5', 'share.open', { url: ORIGIN }), ORIGIN);
    await router.handleMessage(request('6', 'clipboard.copy', { text: '링크' }), ORIGIN);
    expect(sent[0]).toMatchObject({
      id: '5',
      ok: false,
      error: { code: 'CANCELLED', message: '공유를 취소했습니다.' },
    });
    expect(sent[1]).toMatchObject({ id: '6', ok: false, error: { code: 'FAILED' } });
    expect(JSON.stringify(sent[1])).not.toContain('secret detail');
  });

  it('기능이 계약과 다른 결과를 돌려주면 FAILED로 답해야 한다', async () => {
    const { router, sent } = setup({
      'share.open': async () => ({ shared: 'invalid' }) as unknown as { shared: boolean },
    });
    await router.handleMessage(request('7', 'share.open', { url: ORIGIN }), ORIGIN);
    expect(sent[0]).toMatchObject({ id: '7', ok: false, error: { code: 'FAILED' } });
  });

  it('제거한 인증 요청은 실행하지 않고 INVALID로 답해야 한다', async () => {
    const { router, sent } = setup();
    await router.handleMessage(request('retired', 'auth.socialLogin', { provider: 'google' }), ORIGIN);
    expect(sent[0]).toMatchObject({ id: 'retired', ok: false, error: { code: 'INVALID' } });
  });

  it('웹 알림을 검증해 리스너로 전달해야 한다', async () => {
    const { router, onReady } = setup();
    await router.handleMessage(
      JSON.stringify({ v: 1, kind: 'event', type: 'app.ready', payload: { path: '/groups/1' } }),
      ORIGIN,
    );
    expect(onReady).toHaveBeenCalledWith({ path: '/groups/1' });
  });

  it('웹에 보낸 요청의 응답을 id로 짝지어야 한다', async () => {
    const { router, sent } = setup();
    const result = router.requestWeb('navigation.back', {});
    const outgoing = sent[0];
    expect(outgoing).toMatchObject({ kind: 'request', type: 'navigation.back' });
    if (outgoing?.kind !== 'request') throw new Error('요청이 나가지 않았습니다.');
    await router.handleMessage(
      JSON.stringify({ v: 1, kind: 'response', id: outgoing.id, ok: true, result: { handled: true } }),
      ORIGIN,
    );
    await expect(result).resolves.toEqual({ handled: true });
  });

  it('웹이 응답하지 않으면 TIMEOUT으로 끝나야 한다', async () => {
    vi.useFakeTimers();
    const { router } = setup();
    const result = router.requestWeb('navigation.back', {}, { timeoutMs: 100 });
    vi.advanceTimersByTime(100);
    await expect(result).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

describe('주입 스크립트', () => {
  it('앱 정보와 메시지를 스크립트를 깨뜨리지 않는 리터럴로 넣어야 한다', () => {
    const bootstrap = buildBootstrapScript({
      platform: 'android',
      appVersion: '1.0.0',
      protocolVersion: 1,
      capabilities: ['share.open'],
    });
    const target: Record<string, unknown> = {};
    new Function('window', bootstrap)(target);
    expect(target[APP_MARKER_KEY]).toEqual({
      platform: 'android',
      appVersion: '1.0.0',
      protocolVersion: 1,
      capabilities: ['share.open'],
    });

    const dispatched: Array<{ type: string; detail: unknown }> = [];
    class FakeCustomEvent {
      constructor(
        readonly type: string,
        readonly init: { detail: unknown },
      ) {}
    }
    const fakeWindow = {
      dispatchEvent: (event: FakeCustomEvent) =>
        dispatched.push({ type: event.type, detail: event.init.detail }),
    };
    const tricky = '</script>\u2028"\'`${x}';
    const script = buildNativeDispatchScript({
      v: 1,
      kind: 'response',
      id: 'x',
      ok: false,
      error: { code: 'FAILED', message: tricky },
    });
    expect(script).not.toContain('</script>');
    expect(script).not.toContain('\u2028');
    new Function('window', 'CustomEvent', script)(fakeWindow, FakeCustomEvent);
    expect(dispatched[0]?.type).toBe(NATIVE_EVENT_NAME);
    expect(JSON.parse(String(dispatched[0]?.detail))).toMatchObject({ error: { message: tricky } });
  });
});
