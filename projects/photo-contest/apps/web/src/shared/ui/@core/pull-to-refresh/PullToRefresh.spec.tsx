import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PullToRefresh } from './PullToRefresh';

function pull(element: HTMLElement, distance: number) {
  fireEvent.touchStart(element, { touches: [{ clientX: 50, clientY: 50 }] });
  fireEvent.touchMove(element, { touches: [{ clientX: 50, clientY: 50 + distance }], cancelable: true });
  fireEvent.touchEnd(element, { touches: [] });
}

afterEach(() => Object.defineProperty(window, 'scrollY', { value: 0, configurable: true }));

describe('당겨서 새로고침', () => {
  it('충분히 당겨 놓았을 때만 한 번 실행하고 완료될 때까지 다시 실행하지 않아야 한다', async () => {
    let finish: () => void = () => {};
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>피드</p>
      </PullToRefresh>,
    );
    const feed = screen.getByText('피드');
    pull(feed, 40);
    expect(onRefresh).not.toHaveBeenCalled();
    pull(feed, 160);
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('새로고침 중');
    pull(feed, 160);
    expect(onRefresh).toHaveBeenCalledOnce();
    await act(async () => {
      finish();
    });
    await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement());
  });

  it('당기는 중 콜백이 바뀌어도 제스처를 유지하고 최신 조회를 실행해야 한다', async () => {
    const onFirstRefresh = vi.fn(async () => {});
    const onLatestRefresh = vi.fn(async () => {});
    const { rerender, unmount } = render(
      <PullToRefresh onRefresh={onFirstRefresh}>
        <p>피드</p>
      </PullToRefresh>,
    );
    const feed = screen.getByText('피드');
    fireEvent.touchStart(feed, { touches: [{ clientX: 50, clientY: 50 }] });
    fireEvent.touchMove(feed, { touches: [{ clientX: 50, clientY: 210 }], cancelable: true });
    rerender(
      <PullToRefresh onRefresh={onLatestRefresh}>
        <p>피드</p>
      </PullToRefresh>,
    );
    fireEvent.touchEnd(feed, { touches: [] });
    await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement());
    expect(onFirstRefresh).not.toHaveBeenCalled();
    expect(onLatestRefresh).toHaveBeenCalledOnce();
    unmount();
    pull(feed, 180);
    expect(onLatestRefresh).toHaveBeenCalledOnce();
  });

  it('스크롤 중·가로 밀기·취소·여러 손가락 동작은 새로고침하지 않아야 한다', () => {
    const onRefresh = vi.fn(async () => {});
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>피드</p>
      </PullToRefresh>,
    );
    const feed = screen.getByText('피드');
    Object.defineProperty(window, 'scrollY', { value: 100, configurable: true });
    pull(feed, 180);
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    fireEvent.touchStart(feed, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchMove(feed, { touches: [{ clientX: 200, clientY: 150 }] });
    fireEvent.touchEnd(feed);
    fireEvent.touchStart(feed, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchMove(feed, { touches: [{ clientX: 0, clientY: 180 }] });
    fireEvent.touchCancel(feed);
    fireEvent.touchEnd(feed);
    fireEvent.touchStart(feed, {
      touches: [
        { clientX: 0, clientY: 0 },
        { clientX: 100, clientY: 0 },
      ],
    });
    fireEvent.touchMove(feed, { touches: [{ clientX: 0, clientY: 180 }] });
    fireEvent.touchEnd(feed);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('입력과 내부 스크롤을 방해하지 않아야 한다', () => {
    const onRefresh = vi.fn(async () => {});
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <label>
          입력
          <input />
        </label>
        <div data-testid="scroll">
          <p>안쪽 목록</p>
        </div>
      </PullToRefresh>,
    );
    pull(screen.getByRole('textbox'), 180);
    screen.getByTestId('scroll').scrollTop = 100;
    pull(screen.getByText('안쪽 목록'), 180);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('키보드로도 실행할 수 있고 실패 뒤 다시 시도할 수 있어야 한다', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined);
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>피드</p>
      </PullToRefresh>,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: '피드 새로고침' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement());
    pull(screen.getByText('피드'), 180);
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(2));
  });
});
