import { StrictMode } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PullToRefresh } from '../pull-to-refresh';
import { FeedLoadMore } from './FeedLoadMore';

interface IFakeObserver {
  callback: IntersectionObserverCallback;
  connected: boolean;
}

/** 실제 observer처럼 observe 직후 현재 교차 상태를 한 번 알리고, 그 뒤에는 상태가 바뀔 때만 알린다. */
const viewport = { endVisible: false };
const loadingLabel = '게시물을 더 불러오는 중';
const observers: IFakeObserver[] = [];
const notify = (observer: IFakeObserver) =>
  observer.callback(
    [{ isIntersecting: viewport.endVisible } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
const flushObservers = () => act(async () => {});
const scrollEndIntoView = () =>
  act(() => {
    viewport.endVisible = true;
    observers.filter((observer) => observer.connected).forEach(notify);
  });

beforeEach(() => {
  viewport.endVisible = false;
  observers.length = 0;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private readonly record: IFakeObserver;
      constructor(callback: IntersectionObserverCallback) {
        this.record = { callback, connected: false };
        observers.push(this.record);
      }
      observe() {
        this.record.connected = true;
        queueMicrotask(() => {
          if (this.record.connected) notify(this.record);
        });
      }
      disconnect() {
        this.record.connected = false;
      }
      takeRecords() {
        return [];
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('FeedLoadMore', () => {
  it('끝 지점이 보이면 다음 페이지를 부르고 버튼 없이 진행 상태만 알려야 한다', async () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <FeedLoadMore hasMore loading={false} loadingLabel={loadingLabel} onLoadMore={onLoadMore} />,
    );
    await flushObservers();
    expect(onLoadMore).not.toHaveBeenCalled();
    scrollEndIntoView();
    expect(onLoadMore).toHaveBeenCalledOnce();
    rerender(<FeedLoadMore hasMore loading loadingLabel={loadingLabel} onLoadMore={onLoadMore} />);
    expect(screen.getByRole('status')).toHaveTextContent(loadingLabel);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('새 페이지가 짧아 끝 지점이 계속 보이면 불러오기가 끝난 뒤 이어서 불러야 한다', async () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <FeedLoadMore hasMore loading={false} loadingLabel={loadingLabel} onLoadMore={onLoadMore} />,
    );
    scrollEndIntoView();
    expect(onLoadMore).toHaveBeenCalledOnce();
    rerender(<FeedLoadMore hasMore loading loadingLabel={loadingLabel} onLoadMore={onLoadMore} />);
    await flushObservers();
    expect(onLoadMore).toHaveBeenCalledOnce();
    // 교차 상태가 바뀌지 않아 기존 observer는 다시 알리지 않는다. 다시 붙인 observer의 첫 알림으로 이어 간다.
    rerender(<FeedLoadMore hasMore loading={false} loadingLabel={loadingLabel} onLoadMore={onLoadMore} />);
    await flushObservers();
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it('피드 새로고침이 끝나면 끝 지점을 다시 감시해야 한다', async () => {
    const refresh = Promise.withResolvers<void>();
    const onLoadMore = vi.fn();
    render(
      <PullToRefresh onRefresh={() => refresh.promise}>
        <FeedLoadMore hasMore loading={false} loadingLabel={loadingLabel} onLoadMore={onLoadMore} />
      </PullToRefresh>,
    );
    await flushObservers();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '피드 새로고침' })));
    scrollEndIntoView();
    expect(onLoadMore).not.toHaveBeenCalled();
    await act(async () => refresh.resolve());
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it('바뀐 콜백만 부르고 StrictMode 재연결과 목록 끝에서 observer를 남기지 않아야 한다', async () => {
    const onFirstLoad = vi.fn();
    const onLatestLoad = vi.fn();
    const { rerender } = render(
      <StrictMode>
        <FeedLoadMore hasMore loading={false} loadingLabel={loadingLabel} onLoadMore={onFirstLoad} />
      </StrictMode>,
    );
    await flushObservers();
    expect(observers.filter((observer) => observer.connected)).toHaveLength(1);
    rerender(
      <StrictMode>
        <FeedLoadMore hasMore loading={false} loadingLabel={loadingLabel} onLoadMore={onLatestLoad} />
      </StrictMode>,
    );
    scrollEndIntoView();
    expect(onFirstLoad).not.toHaveBeenCalled();
    expect(onLatestLoad).toHaveBeenCalledOnce();
    rerender(
      <StrictMode>
        <FeedLoadMore hasMore={false} loading={false} loadingLabel={loadingLabel} onLoadMore={onLatestLoad} />
      </StrictMode>,
    );
    expect(observers.some((observer) => observer.connected)).toBe(false);
  });
});
