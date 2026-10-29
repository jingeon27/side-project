import { describe, expect, it, vi } from 'vitest';

import { PushInbox } from './push-inbox';

describe('알림 탭 이동', () => {
  it('문서가 준비될 때까지 보관하고 같은 OS 응답은 한 번만 열어야 한다', () => {
    const inbox = new PushInbox();
    const open = vi.fn(() => false),
      received = vi.fn(),
      consumed = vi.fn();
    inbox.bindConsumed(consumed);
    inbox.bind(open, received);
    inbox.tap('first', '/ko/notifications');
    expect(consumed).not.toHaveBeenCalled();
    open.mockReturnValue(true);
    inbox.flush();
    inbox.tap('first', '/ko/notifications');
    inbox.flush();
    expect(consumed).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(2);
    inbox.notify();
    expect(received).toHaveBeenCalledOnce();
  });
  it('외부 주소·인증 콜백·쿼리·알 수 없는 화면을 거부하고 해제 후에는 이동하지 않아야 한다', () => {
    const inbox = new PushInbox();
    const open = vi.fn(() => true);
    const unbind = inbox.bind(open, vi.fn());
    for (const value of [
      'https://evil.example',
      '//evil.example',
      '/app-auth/callback?code=x',
      '/ko/notifications?next=evil',
      '/settings',
      null,
    ])
      inbox.tap(String(value), value);
    expect(open).not.toHaveBeenCalled();
    unbind();
    inbox.tap('valid', '/ko/notifications');
    expect(open).not.toHaveBeenCalled();
    inbox.bind(open, vi.fn());
    expect(open).toHaveBeenCalledExactlyOnceWith('/ko/notifications');
  });
});
