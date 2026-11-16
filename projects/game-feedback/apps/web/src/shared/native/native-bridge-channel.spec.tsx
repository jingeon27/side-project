import { afterEach, describe, expect, it, vi } from 'vitest';

import { BRIDGE_EVENT } from '@game-feedback/bridge';

import { NativeBridgeChannel } from './native-bridge-channel';

const channels = new Set<NativeBridgeChannel>();
afterEach(() => {
  channels.forEach((channel) => channel.stop());
  channels.clear();
  Reflect.deleteProperty(window, '__GAME_FEEDBACK_APP__');
  Reflect.deleteProperty(window, 'ReactNativeWebView');
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function setup() {
  const postMessage = vi.fn();
  Reflect.set(window, '__GAME_FEEDBACK_APP__', { protocol: 1 });
  Reflect.set(window, 'ReactNativeWebView', { postMessage });
  const channel = new NativeBridgeChannel();
  channels.add(channel);
  const binding = {
    path: '/ko',
    overlayOpen: false,
    onOpen: vi.fn(),
    onActive: vi.fn(),
    onDismissOverlay: vi.fn(),
    onBack: vi.fn(() => ({ handled: false, atRoot: true })),
  };
  const emit = (detail: unknown) => window.dispatchEvent(new CustomEvent(BRIDGE_EVENT, { detail }));
  return { channel, binding, emit, postMessage };
}
describe('instrumented native bridge channel', () => {
  it('subscribes once and uses the latest binding without resubscribing DOM events', () => {
    const { channel, binding, emit, postMessage } = setup();
    const subscribe = vi.spyOn(window, 'addEventListener');
    channel.start();
    channel.start();
    const release = channel.bind(binding);
    const next = { ...binding, path: '/ko/guide', onActive: vi.fn() };
    channel.bind(next);
    release();
    emit({ type: 'state', state: 'active' });
    expect(next.onActive).toHaveBeenCalledOnce();
    expect(binding.onActive).not.toHaveBeenCalled();
    expect(subscribe.mock.calls.filter(([name]) => name === BRIDGE_EVENT)).toHaveLength(1);
    expect(
      postMessage.mock.calls.map(([data]) => JSON.parse(data)).filter((message) => message.type === 'ready'),
    ).toHaveLength(1);
  });
  it('keeps valid navigation and foreground events received before React binds', () => {
    const { channel, binding, emit } = setup();
    channel.start();
    emit({ type: 'open', path: '/ko/guide' });
    emit({ type: 'state', state: 'active' });
    emit({ type: 'open', path: 'javascript:alert(1)' });
    channel.bind(binding);
    expect(binding.onOpen).toHaveBeenCalledExactlyOnceWith('/ko/guide');
    expect(binding.onActive).toHaveBeenCalledOnce();
  });
  it('closes popups and overlays before requesting route navigation', () => {
    const { channel, binding, emit, postMessage } = setup();
    channel.start();
    channel.bind({ ...binding, overlayOpen: true });
    const popup = document.createElement('div');
    popup.setAttribute('data-slot', 'dropdown-menu-content');
    popup.setAttribute('data-open', '');
    document.body.append(popup);
    const keydown = vi.fn();
    popup.addEventListener('keydown', keydown);
    emit({ type: 'back', id: 'popup' });
    expect(keydown).toHaveBeenCalledOnce();
    expect(binding.onDismissOverlay).not.toHaveBeenCalled();
    popup.remove();
    emit({ type: 'back', id: 'sheet' });
    expect(binding.onDismissOverlay).toHaveBeenCalledOnce();
    expect(binding.onBack).not.toHaveBeenCalled();
    channel.bind(binding);
    emit({ type: 'back', id: 'root' });
    expect(JSON.parse(postMessage.mock.calls.at(-1)?.[0] ?? '{}')).toMatchObject({
      id: 'root',
      handled: false,
      atRoot: true,
    });
  });
  // 네이티브는 back-result를 800ms만 기다린다. 이탈 확인 창을 띄울 수 있는 닫기·이동보다 응답이 먼저 나가야 한다.
  it('answers back before dismissing an overlay or navigating, which may wait on a confirm dialog', () => {
    const { channel, binding, emit, postMessage } = setup();
    const answers = () =>
      postMessage.mock.calls
        .map(([data]) => JSON.parse(data))
        .filter((message) => message.type === 'back-result');
    const onDismissOverlay = vi.fn(answers);
    const navigate = vi.fn(answers);
    channel.start();
    channel.bind({ ...binding, overlayOpen: true, onDismissOverlay });
    emit({ type: 'back', id: 'sheet' });
    expect(onDismissOverlay.mock.results[0]?.value).toEqual([
      { type: 'back-result', id: 'sheet', handled: true },
    ]);
    channel.bind({ ...binding, onBack: () => ({ handled: true, navigate }) });
    emit({ type: 'back', id: 'page' });
    expect(navigate.mock.results[0]?.value).toContainEqual({
      type: 'back-result',
      id: 'page',
      handled: true,
    });
  });
  it('ignores malformed messages and disconnects after disposal', () => {
    const { channel, binding, emit } = setup();
    channel.start();
    channel.bind(binding);
    emit({ type: 'open', path: '//external.example' });
    emit({ type: 'state', state: 'invalid' });
    channel.stop();
    emit({ type: 'state', state: 'active' });
    expect(binding.onActive).not.toHaveBeenCalled();
    expect(binding.onOpen).not.toHaveBeenCalled();
  });
});
