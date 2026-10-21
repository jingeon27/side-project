import { StrictMode } from 'react';

import { fetchEventSource, type FetchEventSourceInit } from '@microsoft/fetch-event-source';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatRealtimeConnection } from './chat-realtime-connection';
import { chatMessageOptions, conversationListOptions } from './chat.options';
import { useChatRealtime } from './use-chat-realtime';

vi.mock('@microsoft/fetch-event-source', () => ({
  EventStreamContentType: 'text/event-stream',
  fetchEventSource: vi.fn(() => Promise.resolve()),
}));
const transport = vi.mocked(fetchEventSource);
function request(index = -1) {
  const options = transport.mock.calls.at(index)?.[1];
  if (!options) throw new Error('Missing stream request');
  return options;
}
function invalidate(stream: FetchEventSourceInit, data: string) {
  stream.onmessage?.({ event: 'invalidate', data, id: '' });
}
function setup() {
  const client = new QueryClient();
  const onSessionStale = vi.fn();
  const channel = new ChatRealtimeConnection({ userId: 'alice', client, onSessionStale });
  const onChange = vi.fn();
  const dispose = channel.subscribe(onChange);
  return { client, onSessionStale, onChange, channel, dispose, stream: request() };
}
function ready(stream: FetchEventSourceInit) {
  return stream.onopen?.(
    new Response('', { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } }),
  );
}
beforeEach(() => {
  transport.mockClear();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('chat SSE external store', () => {
  it('uses cookie fetch and invalidates only the viewer and target room after a valid event', async () => {
    const { client, channel, onChange, stream, dispose } = setup();
    expect(transport).toHaveBeenCalledWith(
      '/api/chat/events',
      expect.objectContaining({ credentials: 'include', openWhenHidden: false }),
    );
    await ready(stream);
    expect(channel.getSnapshot()).toBe('live');
    expect(onChange).toHaveBeenCalledOnce();
    const inbox = conversationListOptions('alice').queryKey;
    const target = chatMessageOptions('alice', 'room-1').queryKey;
    const other = chatMessageOptions('alice', 'room-2').queryKey;
    const otherViewer = conversationListOptions('bob').queryKey;
    for (const key of [inbox, target, other, otherViewer])
      client.setQueryData(key, { pages: [], pageParams: [] });
    invalidate(stream, JSON.stringify({ conversationId: 'room-1' }));
    expect(client.getQueryState(inbox)?.isInvalidated).toBe(true);
    expect(client.getQueryState(target)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
    expect(client.getQueryState(otherViewer)?.isInvalidated).toBe(false);
    dispose();
    client.clear();
  });

  it('ignores invalid payloads and stale callbacks after all subscribers leave', async () => {
    const { client, stream, onChange, dispose } = setup();
    const invalidation = vi.spyOn(client, 'invalidateQueries');
    invalidate(stream, '{invalid');
    invalidate(stream, JSON.stringify({ conversationId: 42 }));
    stream.onmessage?.({ event: 'heartbeat', data: '{}', id: '' });
    expect(invalidation).not.toHaveBeenCalled();
    dispose();
    onChange.mockClear();
    expect(stream.signal?.aborted).toBe(true);
    await ready(stream);
    invalidate(stream, JSON.stringify({ conversationId: 'room-1' }));
    stream.onerror?.(new Error('closed'));
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(invalidation).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(transport).toHaveBeenCalledOnce();
    client.clear();
  });

  it('shares one stream and reopens it after the last unsubscribe, including StrictMode', async () => {
    const { client, channel, stream, dispose } = setup();
    const unsubscribe = channel.subscribe(vi.fn());
    expect(transport).toHaveBeenCalledOnce();
    dispose();
    expect(stream.signal?.aborted).toBe(false);
    unsubscribe();
    expect(stream.signal?.aborted).toBe(true);
    const remounted = channel.subscribe(vi.fn());
    expect(transport).toHaveBeenCalledTimes(2);
    await ready(request());
    expect(channel.getSnapshot()).toBe('live');
    remounted();
    client.clear();
  });

  it('backs off retries, throttles session checks and recovers messages after reconnect', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { client, channel, stream, onSessionStale, dispose } = setup();
    expect(stream.onerror?.(new Error('network'))).toBe(1000);
    expect(stream.onerror?.(new Error('network'))).toBe(2000);
    expect(channel.getSnapshot()).toBe('retrying');
    expect(onSessionStale).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(5000);
    expect(stream.onerror?.(new Error('network'))).toBe(4000);
    expect(onSessionStale).toHaveBeenCalledTimes(2);
    const invalidation = vi.spyOn(client, 'invalidateQueries');
    await ready(stream);
    expect(channel.getSnapshot()).toBe('live');
    expect(invalidation).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['chat', 'alice', 'messages'] }),
    );
    expect(stream.onerror?.(new Error('network'))).toBe(1000);
    dispose();
    client.clear();
  });

  it('aborts offline, opens only one new request online and disposes the old account', async () => {
    const { client, channel, stream, dispose } = setup();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    expect(channel.getSnapshot()).toBe('offline');
    expect(stream.signal?.aborted).toBe(true);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('online'));
    expect(transport).toHaveBeenCalledTimes(2);
    await ready(request());
    expect(channel.getSnapshot()).toBe('live');
    dispose();
    client.clear();
  });

  it('validates HTTP responses, honors a bounded Retry-After and stops retrying unauthorized sessions', async () => {
    const { client, stream, onSessionStale, dispose } = setup();
    const failure = await stream
      .onopen?.(new Response('not SSE', { status: 429, headers: { 'Retry-After': '12' } }))
      .catch((error) => error);
    expect(stream.onerror?.(failure)).toBe(12_000);
    await expect(
      stream.onopen?.(new Response('<html/>', { headers: { 'Content-Type': 'text/html' } })),
    ).rejects.toThrow('Chat stream unavailable');
    const unauthorized = await stream.onopen?.(new Response('', { status: 401 })).catch((error) => error);
    expect(() => stream.onerror?.(unauthorized)).toThrow('Session unavailable');
    expect(onSessionStale).toHaveBeenCalledTimes(2);
    dispose();
    client.clear();
  });

  it('keeps React subscribed to the current viewer and opens no guest connection', async () => {
    const client = new QueryClient();
    const onSessionStale = vi.fn();
    function Connection({ userId }: { userId?: string }) {
      return <p>{useChatRealtime(userId, onSessionStale)}</p>;
    }
    function App({ userId }: { userId?: string }) {
      return (
        <StrictMode>
          <QueryClientProvider client={client}>
            <Connection userId={userId} />
          </QueryClientProvider>
        </StrictMode>
      );
    }
    const { rerender, unmount } = render(<App />);
    expect(transport).not.toHaveBeenCalled();
    rerender(<App userId="alice" />);
    const alice = request();
    await act(() => ready(alice));
    expect(screen.getByText('live')).toBeTruthy();
    rerender(<App userId="bob" />);
    expect(alice.signal?.aborted).toBe(true);
    expect(screen.getByText('connecting')).toBeTruthy();
    const bob = request();
    await act(() => ready(bob));
    rerender(<App />);
    expect(bob.signal?.aborted).toBe(true);
    expect(screen.getByText('connecting')).toBeTruthy();
    unmount();
    client.clear();
  });
});
