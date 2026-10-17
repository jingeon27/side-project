import { describe, expect, it, vi } from 'vitest';
import { ChatScrollController } from './chat-scroll-controller';

describe('chat scroll position', () => {
  it('follows the first history and preserves an older reading position when new messages arrive', () => {
    const controller = new ChatScrollController();
    const viewport = { scrollTop: 0, scrollHeight: 1000, clientHeight: 300 };
    controller.reconcile(viewport, 'message-1', false);
    expect(viewport.scrollTop).toBe(1000);
    viewport.scrollTop = 100;
    controller.scroll(viewport);
    viewport.scrollHeight = 1100;
    controller.reconcile(viewport, 'message-2', false);
    expect(viewport.scrollTop).toBe(100);
    expect(controller.getSnapshot()).toBe(true);
    controller.scrollLatest(viewport);
    expect(viewport.scrollTop).toBe(1100);
    expect(controller.getSnapshot()).toBe(false);
  });
  it('keeps the visible anchor when older messages are prepended', () => {
    const controller = new ChatScrollController();
    const viewport = { scrollTop: 120, scrollHeight: 1000, clientHeight: 300 };
    controller.captureHistory(viewport);
    controller.reconcile(viewport, 'newest', true);
    expect(viewport.scrollTop).toBe(120);
    viewport.scrollHeight = 1500;
    controller.reconcile(viewport, 'newest', false);
    expect(viewport.scrollTop).toBe(620);
  });
  it('follows a sent message and releases unseen-message subscriptions', () => {
    const controller = new ChatScrollController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    const viewport = { scrollTop: 0, scrollHeight: 1000, clientHeight: 300 };
    controller.reconcile(viewport, 'first', false);
    viewport.scrollTop = 0;
    controller.scroll(viewport);
    controller.reconcile(viewport, 'next', false);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    controller.sent();
    controller.reconcile(viewport, 'sent', false);
    expect(controller.getSnapshot()).toBe(false);
    expect(viewport.scrollTop).toBe(1000);
    expect(listener).toHaveBeenCalledOnce();
  });
});
