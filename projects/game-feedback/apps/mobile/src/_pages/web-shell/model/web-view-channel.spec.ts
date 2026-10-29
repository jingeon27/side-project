import { describe, expect, it, vi } from 'vitest';

import { WebViewChannel } from './web-view-channel';

const origin = 'https://feedback.example';

describe('WebViewChannel external store', () => {
  it('keeps snapshot identity until rendered state changes and unsubscribes listeners', () => {
    const channel = new WebViewChannel(`${origin}/`);
    const { subscribe, getSnapshot, finishLoading } = channel;
    const initial = getSnapshot();
    const listener = vi.fn(getSnapshot);
    const unsubscribe = subscribe(listener);

    channel.setOverlayOpen(false);
    expect(getSnapshot()).toBe(initial);
    expect(listener).not.toHaveBeenCalled();

    finishLoading();
    const loaded = getSnapshot();
    expect(loaded).not.toBe(initial);
    expect(loaded.loading).toBe(false);
    expect(initial.loading).toBe(true);
    expect(listener).toHaveReturnedWith(loaded);
    finishLoading();
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    channel.setOverlayOpen(true);
    expect(listener).toHaveBeenCalledOnce();
    expect(getSnapshot().overlayOpen).toBe(true);
  });

  it('remembers a warm route without replacing the document, then recovers it atomically', () => {
    const channel = new WebViewChannel(`${origin}/`);
    channel.finishLoading();
    channel.setOverlayOpen(true);
    const ready = channel.getSnapshot();
    const listener = vi.fn(channel.getSnapshot);
    channel.subscribe(listener);

    channel.rememberUrl(`${origin}/ja/messages/thread-1?tab=unanswered`);
    channel.rememberHistory(true);
    expect(channel.getSnapshot()).toBe(ready);
    expect(listener).not.toHaveBeenCalled();

    channel.fail();
    expect(listener).toHaveReturnedWith({ ...ready, offline: true, overlayOpen: false });
    listener.mockClear();
    channel.recreate();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveReturnedWith({
      sourceUrl: `${origin}/ja/messages/thread-1?tab=unanswered`,
      webViewKey: 1,
      loading: true,
      offline: false,
      overlayOpen: false,
    });
    expect(channel.canGoBack()).toBe(false);
  });

  it('opens cold links through the source and keeps channel instances independent', () => {
    const first = new WebViewChannel(`${origin}/`);
    const second = new WebViewChannel(`${origin}/`);
    const secondSnapshot = second.getSnapshot();
    const listener = vi.fn();
    second.subscribe(listener);

    first.rememberUrl(`${origin}/en/settings`);
    first.loadCurrentDocument();
    first.rememberHistory(true);
    expect(first.getSnapshot().sourceUrl).toBe(`${origin}/en/settings`);
    expect(first.canGoBack()).toBe(true);
    expect(second.getSnapshot()).toBe(secondSnapshot);
    expect(second.currentUrl()).toBe(`${origin}/`);
    expect(second.canGoBack()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('distinguishes hash changes from document loads and repeated reloads', () => {
    const channel = new WebViewChannel(`${origin}/en/settings`);
    expect(channel.startsDocument(`${origin}/en/settings#language`)).toBe(false);
    expect(channel.startsDocument(`${origin}/en/settings`)).toBe(false);
    expect(channel.startsDocument(`${origin}/en/settings`)).toBe(true);
    expect(channel.startsDocument(`${origin}/en/settings?tab=privacy`)).toBe(true);
  });
});
