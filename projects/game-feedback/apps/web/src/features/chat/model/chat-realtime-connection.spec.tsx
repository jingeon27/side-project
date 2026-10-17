import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatRealtimeConnection } from './chat-realtime-connection';
import { chatMessageOptions, conversationListOptions } from './chat.options';

class FakeEventSource extends EventTarget {
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = 0;
  close = vi.fn(() => {
    this.readyState = FakeEventSource.CLOSED;
  });
  constructor(
    readonly url: string,
    readonly options: EventSourceInit,
  ) {
    super();
    FakeEventSource.instances.push(this);
  }
}
function setup() {
  const client = new QueryClient();
  const onSessionStale = vi.fn();
  const onConnection = vi.fn();
  const channel = new ChatRealtimeConnection({ userId: 'alice', client, onSessionStale, onConnection });
  const dispose = channel.connect();
  const stream = FakeEventSource.instances.at(-1);
  if (!stream) throw new Error('Missing stream');
  return { client, onSessionStale, onConnection, dispose, stream };
}
beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('chat SSE lifecycle', () => {
  it('uses cookies and invalidates only the current viewer and target conversation', () => {
    const { client, stream, dispose } = setup();
    const inbox = conversationListOptions('alice').queryKey;
    const target = chatMessageOptions('alice', 'room-1').queryKey;
    const other = chatMessageOptions('alice', 'room-2').queryKey;
    const otherViewer = conversationListOptions('bob').queryKey;
    for (const key of [inbox, target, other, otherViewer])
      client.setQueryData(key, { pages: [], pageParams: [] });
    stream.dispatchEvent(
      new MessageEvent('invalidate', { data: JSON.stringify({ conversationId: 'room-1' }) }),
    );
    expect(stream.url).toBe('/api/chat/events');
    expect(stream.options).toEqual({ withCredentials: true });
    expect(client.getQueryState(inbox)?.isInvalidated).toBe(true);
    expect(client.getQueryState(target)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
    expect(client.getQueryState(otherViewer)?.isInvalidated).toBe(false);
    dispose();
    client.clear();
  });
  it('ignores malformed events and detaches all events when the viewer changes', () => {
    const { client, stream, onConnection, dispose } = setup();
    const invalidation = vi.spyOn(client, 'invalidateQueries');
    stream.dispatchEvent(new MessageEvent('invalidate', { data: '{invalid' }));
    stream.dispatchEvent(new MessageEvent('invalidate', { data: JSON.stringify({ conversationId: 42 }) }));
    expect(invalidation).not.toHaveBeenCalled();
    dispose();
    onConnection.mockClear();
    stream.dispatchEvent(new Event('open'));
    stream.dispatchEvent(new Event('error'));
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(stream.close).toHaveBeenCalledOnce();
    expect(invalidation).not.toHaveBeenCalled();
    expect(onConnection).not.toHaveBeenCalled();
    client.clear();
  });
  it('throttles session checks and recovers a closed stream when connectivity returns', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { client, stream, onConnection, onSessionStale, dispose } = setup();
    stream.dispatchEvent(new Event('error'));
    stream.dispatchEvent(new Event('error'));
    expect(onSessionStale).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(5_000);
    stream.dispatchEvent(new Event('error'));
    expect(onSessionStale).toHaveBeenCalledTimes(2);
    stream.readyState = FakeEventSource.CLOSED;
    window.dispatchEvent(new Event('online'));
    expect(FakeEventSource.instances).toHaveLength(2);
    const next = FakeEventSource.instances.at(-1);
    next?.dispatchEvent(new Event('open'));
    expect(onConnection).toHaveBeenLastCalledWith('live');
    dispose();
    client.clear();
  });
});
