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

  it('stays at the latest message through a send render and later viewport or media resizing', () => {
    const controller = new ChatScrollController();
    const viewport = { scrollTop: 0, scrollHeight: 1000, clientHeight: 300 };
    controller.reconcile(viewport, 'first', false);
    viewport.scrollTop = 100;
    controller.scroll(viewport);
    controller.sent();
    controller.reconcile(viewport, 'first', false);
    viewport.scrollHeight = 1100;
    controller.reconcile(viewport, 'sent', false);
    expect(viewport.scrollTop).toBe(1100);
    viewport.scrollHeight = 1400;
    viewport.clientHeight = 200;
    controller.resize(viewport);
    expect(viewport.scrollTop).toBe(1400);
    expect(controller.getSnapshot()).toBe(false);
  });

  it('preserves a reading position through resizing and does not consume an in-flight history anchor', () => {
    const controller = new ChatScrollController();
    const viewport = { scrollTop: 0, scrollHeight: 1000, clientHeight: 300 };
    controller.reconcile(viewport, 'first', false);
    viewport.scrollTop = 100;
    controller.scroll(viewport);
    viewport.scrollHeight = 1200;
    controller.resize(viewport);
    expect(viewport.scrollTop).toBe(100);
    controller.captureHistory(viewport);
    viewport.scrollHeight = 1800;
    controller.resize(viewport);
    expect(viewport.scrollTop).toBe(100);
    controller.reconcile(viewport, 'first', false);
    expect(viewport.scrollTop).toBe(700);
  });

  it('gives an explicit send priority over loading older history', () => {
    const controller = new ChatScrollController();
    const viewport = { scrollTop: 0, scrollHeight: 1000, clientHeight: 300 };
    controller.reconcile(viewport, 'first', false);
    viewport.scrollTop = 100;
    controller.scroll(viewport);
    controller.captureHistory(viewport);
    controller.sent();
    viewport.scrollHeight = 1800;
    controller.reconcile(viewport, 'sent', true);
    expect(viewport.scrollTop).toBe(1800);
  });

  it('releases a completed send so later resizing does not interrupt reading', () => {
    const controller = new ChatScrollController();
    const viewport = { scrollTop: 0, scrollHeight: 1000, clientHeight: 300 };
    controller.reconcile(viewport, 'first', false);
    controller.sent();
    controller.scrollLatest(viewport);
    viewport.scrollTop = 100;
    controller.scroll(viewport);
    viewport.scrollHeight = 1400;
    controller.resize(viewport);
    expect(viewport.scrollTop).toBe(100);
  });
});
