import { Activity, StrictMode } from 'react';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatScrollController } from './chat-scroll-controller';
import { useChatScroll } from './use-chat-scroll';

const observers = new Set<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>();
const intersections = new Set<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>();
const installObservers = () => {
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(function () {
      const observer = { observe: vi.fn(), disconnect: vi.fn() };
      observers.add(observer);
      return observer;
    }),
  );
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn(function () {
      const observer = { observe: vi.fn(), disconnect: vi.fn() };
      intersections.add(observer);
      return observer;
    }),
  );
};

afterEach(() => {
  cleanup();
  observers.clear();
  intersections.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Viewport({ stamp = 'first', unavailable = false, visible = true }) {
  const { scroller } = useChatScroll({
    messageStamp: stamp,
    newestId: stamp,
    pending: false,
    unavailable,
    fetchingOlder: false,
  });
  return visible ? (
    <div ref={scroller}>
      <div data-message-id={stamp} />
    </div>
  ) : null;
}

describe('chat viewport callback ref lifecycle', () => {
  it('observes the attached viewport and content without reconnecting for new messages', () => {
    installObservers();
    const reconcile = vi.spyOn(ChatScrollController.prototype, 'reconcile');
    const view = render(<Viewport />);
    const observer = [...observers][0];
    expect(observer?.observe).toHaveBeenCalledTimes(2);
    expect(reconcile).toHaveBeenCalled();
    view.rerender(<Viewport stamp="second" />);
    expect(observers.size).toBe(1);
    expect(observer?.disconnect).not.toHaveBeenCalled();
    expect(reconcile).toHaveBeenLastCalledWith(expect.any(HTMLDivElement), 'second', false);
    view.unmount();
    expect(observer?.disconnect).toHaveBeenCalledOnce();
  });

  it('disconnects when unavailable or detached and reconnects when the viewport returns', () => {
    installObservers();
    const view = render(<Viewport />);
    const first = [...observers][0];
    view.rerender(<Viewport unavailable />);
    expect(first?.disconnect).toHaveBeenCalledOnce();
    expect(observers.size).toBe(1);
    view.rerender(<Viewport />);
    expect(observers.size).toBe(2);
    view.rerender(<Viewport visible={false} />);
    expect([...observers][1]?.disconnect).toHaveBeenCalledOnce();
    view.rerender(<Viewport />);
    expect(observers.size).toBe(3);
    view.unmount();
    for (const observer of observers) expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it('clears the detached node before later messages can reconcile or observe it', () => {
    installObservers();
    const reconcile = vi.spyOn(ChatScrollController.prototype, 'reconcile');
    const view = render(<Viewport />);
    const reading = [...intersections][0];
    expect(reading?.observe).toHaveBeenCalledOnce();
    view.rerender(<Viewport visible={false} />);
    expect(reading?.disconnect).toHaveBeenCalledOnce();
    reconcile.mockClear();
    const count = intersections.size;
    view.rerender(<Viewport visible={false} stamp="detached-message" />);
    expect(reconcile).not.toHaveBeenCalled();
    expect(intersections.size).toBe(count);
    view.rerender(<Viewport stamp="reattached-message" />);
    expect(reconcile).toHaveBeenLastCalledWith(expect.any(HTMLDivElement), 'reattached-message', false);
    expect(intersections.size).toBe(count + 1);
    view.unmount();
    for (const observer of intersections) expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it('releases a hidden Activity viewport and reattaches when shown', () => {
    installObservers();
    const view = render(
      <Activity mode="visible">
        <Viewport />
      </Activity>,
    );
    const first = [...observers][0];
    view.rerender(
      <Activity mode="hidden">
        <Viewport />
      </Activity>,
    );
    expect(first?.disconnect).toHaveBeenCalledOnce();
    view.rerender(
      <Activity mode="visible">
        <Viewport />
      </Activity>,
    );
    expect(observers.size).toBe(2);
    view.unmount();
    for (const observer of observers) expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it('releases every StrictMode attachment', () => {
    installObservers();
    const view = render(
      <StrictMode>
        <Viewport />
      </StrictMode>,
    );
    expect(observers.size).toBeGreaterThan(1);
    view.unmount();
    for (const observer of observers) expect(observer.disconnect).toHaveBeenCalledOnce();
  });
});
