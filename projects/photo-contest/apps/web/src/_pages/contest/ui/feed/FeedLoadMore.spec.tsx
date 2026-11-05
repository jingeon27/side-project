import { StrictMode } from 'react';

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FeedLoadMore } from './FeedLoadMore';

interface IFakeObserver {
  callback: IntersectionObserverCallback;
  connected: boolean;
}

/** 실제 observer처럼 observe 직후 현재 교차 상태를 한 번 알리고, 그 뒤에는 상태가 바뀔 때만 알린다. */
const viewport = { endVisible: false };
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
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('FeedLoadMore', () => {
  it('끝 지점이 보이면 다음 사진을 부르고 버튼 없이 진행 상태만 알려야 한다', async () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(<FeedLoadMore hasMore loading={false} onLoadMore={onLoadMore} />);
    await flushObservers();
    expect(onLoadMore).not.toHaveBeenCalled();
    scrollEndIntoView();
    expect(onLoadMore).toHaveBeenCalledOnce();
    rerender(<FeedLoadMore hasMore loading onLoadMore={onLoadMore} />);
    expect(screen.getByRole('status')).toHaveTextContent('사진을 더 불러오는 중');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('새 페이지가 짧아 끝 지점이 계속 보이면 불러오기가 끝난 뒤 이어서 불러야 한다', async () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(<FeedLoadMore hasMore loading={false} onLoadMore={onLoadMore} />);
    scrollEndIntoView();
    expect(onLoadMore).toHaveBeenCalledOnce();
    rerender(<FeedLoadMore hasMore loading onLoadMore={onLoadMore} />);
    await flushObservers();
    expect(onLoadMore).toHaveBeenCalledOnce();
    // 교차 상태가 바뀌지 않아 기존 observer는 다시 알리지 않는다. 다시 붙인 observer의 첫 알림으로 이어 간다.
    rerender(<FeedLoadMore hasMore loading={false} onLoadMore={onLoadMore} />);
    await flushObservers();
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it('바뀐 콜백만 부르고 StrictMode 재연결과 목록 끝에서 observer를 남기지 않아야 한다', async () => {
    const onFirstLoad = vi.fn();
    const onLatestLoad = vi.fn();
    const { rerender } = render(
      <StrictMode>
        <FeedLoadMore hasMore loading={false} onLoadMore={onFirstLoad} />
      </StrictMode>,
    );
    await flushObservers();
    expect(observers.filter((observer) => observer.connected)).toHaveLength(1);
    rerender(
      <StrictMode>
        <FeedLoadMore hasMore loading={false} onLoadMore={onLatestLoad} />
      </StrictMode>,
    );
    scrollEndIntoView();
    expect(onFirstLoad).not.toHaveBeenCalled();
    expect(onLatestLoad).toHaveBeenCalledOnce();
    rerender(
      <StrictMode>
        <FeedLoadMore hasMore={false} loading={false} onLoadMore={onLatestLoad} />
      </StrictMode>,
    );
    expect(observers.some((observer) => observer.connected)).toBe(false);
  });
});
