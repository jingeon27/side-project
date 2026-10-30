import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FeedLoadMore } from './FeedLoadMore';

afterEach(() => vi.unstubAllGlobals());

describe('FeedLoadMore', () => {
  it('observer를 유지하면서 최신 로딩 상태와 콜백을 읽고 목록이 끝나면 해제해야 한다', () => {
    const callbacks: IntersectionObserverCallback[] = [];
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          callbacks.push(callback);
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const onFirstLoad = vi.fn();
    const onLatestLoad = vi.fn();
    const { rerender } = render(<FeedLoadMore hasMore loading={false} onLoadMore={onFirstLoad} />);
    const intersect = () =>
      act(() => {
        callbacks[0]?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      });
    rerender(<FeedLoadMore hasMore loading onLoadMore={onLatestLoad} />);
    intersect();
    expect(onFirstLoad).not.toHaveBeenCalled();
    expect(onLatestLoad).not.toHaveBeenCalled();
    rerender(<FeedLoadMore hasMore loading={false} onLoadMore={onLatestLoad} />);
    intersect();
    expect(onLatestLoad).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledOnce();
    rerender(<FeedLoadMore hasMore={false} loading={false} onLoadMore={onLatestLoad} />);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('observer가 없어도 더 보기 버튼으로 불러올 수 있어야 한다', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const onLoadMore = vi.fn();
    render(<FeedLoadMore hasMore loading={false} onLoadMore={onLoadMore} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '사진 더 보기' }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });
});
