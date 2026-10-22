import { expect, it, vi } from 'vitest';

import { parseWebOrigin } from '@/shared/config/web-origin';

import { NativeHost } from './native-host';

it('대문자 호스트·:443으로 설정한 origin에서도 같은 origin의 브리지 메시지를 받아야 한다', () => {
  const onReady = vi.fn();
  const host = new NativeHost({
    origin: parseWebOrigin('https://Feedback.Example:443', false),
    send: vi.fn(),
    login: vi.fn(),
    onLocation: vi.fn(),
    onReady,
  });
  host.receive(JSON.stringify({ type: 'ready' }), 'https://feedback.example.evil/ko');
  expect(onReady).not.toHaveBeenCalled();
  host.receive(JSON.stringify({ type: 'ready' }), 'https://feedback.example/ko');
  expect(onReady).toHaveBeenCalledOnce();
});
