import { Profiler } from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PullToRefresh } from './PullToRefresh';

function touch(target: HTMLElement, y: number, x = 50, identifier = 1) {
  return { target, identifier, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y };
}

function send(target: HTMLElement, type: string, touches: ReturnType<typeof touch>[], changed = touches) {
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
  Object.defineProperties(event, {
    touches: { value: touches },
    targetTouches: { value: touches },
    changedTouches: { value: changed },
  });
  fireEvent(target, event);
  return event;
}

function start(target: HTMLElement) {
  send(target, 'touchstart', [touch(target, 50)]);
}

function move(target: HTMLElement, distance: number, x = 50) {
  return send(target, 'touchmove', [touch(target, 50 + distance, x)]);
}

function end(target: HTMLElement, distance = 160) {
  send(target, 'touchend', [], [touch(target, 50 + distance)]);
}

function pull(target: HTMLElement, distance: number) {
  start(target);
  move(target, distance);
  end(target, distance);
}

afterEach(() => Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 }));

describe('당겨서 새로고침', () => {
  it('첫 이동을 같은 native 이벤트 작업에서 처리하고 같은 표시 구간에서는 다시 commit하지 않아야 한다', () => {
    const handleRender = vi.fn();
    const onRefresh = vi.fn(async () => {});
    render(
      <Profiler id="pull-to-refresh" onRender={handleRender}>
        <PullToRefresh onRefresh={onRefresh}>
          <p>피드</p>
        </PullToRefresh>
      </Profiler>,
    );
    const feed = screen.getByText('피드');
    act(() => {
      start(feed);
      expect(move(feed, 20).defaultPrevented).toBe(true);
    });
    expect(screen.getByRole('status')).toHaveTextContent('아래로 당겨 새로고침');
    handleRender.mockClear();
    for (const distance of [30, 60, 100, 120]) move(feed, distance);
    expect(handleRender).not.toHaveBeenCalled();
    move(feed, 128);
    expect(screen.getByRole('status')).toHaveTextContent('놓으면 새로고침');
    handleRender.mockClear();
    for (const distance of [140, 160, 180]) move(feed, distance);
    expect(handleRender).not.toHaveBeenCalled();
    move(feed, 120);
    expect(screen.getByRole('status')).toHaveTextContent('아래로 당겨 새로고침');
    end(feed, 120);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shadow DOM 안의 입력과 스크롤 영역도 이벤트 경로에서 제외해야 한다', () => {
    const onRefresh = vi.fn(async () => {});
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <div data-testid="host" />
      </PullToRefresh>,
    );
    const shadow = screen.getByTestId('host').attachShadow({ mode: 'open' });
    const button = document.createElement('button');
    const scroller = document.createElement('div');
    scroller.scrollTop = 100;
    shadow.append(button, scroller);
    for (const target of [button, scroller]) {
      start(target);
      expect(move(target, 180).defaultPrevented).toBe(false);
      end(target);
    }
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('임계값을 넘겨 놓을 때만 조회하고 작업 완료 전 중복 요청을 막아야 한다', async () => {
    const task = Promise.withResolvers<void>();
    const onRefresh = vi.fn(() => task.promise);
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>피드</p>
      </PullToRefresh>,
    );
    const feed = screen.getByText('피드');
    pull(feed, 127);
    expect(onRefresh).not.toHaveBeenCalled();
    act(() => {
      pull(feed, 128);
      pull(feed, 180);
    });
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    expect(screen.getByRole('status')).toHaveTextContent('새로고침 중');
    expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('button'));
    expect(onRefresh).toHaveBeenCalledOnce();
    await act(async () => task.resolve());
    await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement());
    expect(screen.getByRole('button')).toBeEnabled();
  });

  it('유효한 아래쪽 당기기만 기본 동작을 막고 가로 이동·위로 스크롤은 허용해야 한다', () => {
    const onRefresh = vi.fn(async () => {});
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>피드</p>
      </PullToRefresh>,
    );
    const feed = screen.getByText('피드');
    start(feed);
    expect(move(feed, -30).defaultPrevented).toBe(false);
    end(feed);
    start(feed);
    expect(move(feed, 60).defaultPrevented).toBe(true);
    expect(move(feed, 160, 300).defaultPrevented).toBe(false);
    end(feed);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('문서를 스크롤한 상태에서는 당기기를 가로채지 않아야 한다', () => {
    const onRefresh = vi.fn(async () => {});
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>피드</p>
      </PullToRefresh>,
    );
    const feed = screen.getByText('피드');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 100 });
    start(feed);
    expect(move(feed, 180).defaultPrevented).toBe(false);
    end(feed);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('핀치 시작·touchcancel 뒤에는 조회하지 않고 다음 한 손가락 동작은 복구해야 한다', async () => {
    const onRefresh = vi.fn(async () => {});
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>피드</p>
      </PullToRefresh>,
    );
    const feed = screen.getByText('피드');
    start(feed);
    move(feed, 180);
    send(feed, 'touchstart', [touch(feed, 230), touch(feed, 230, 100, 2)], [touch(feed, 230, 100, 2)]);
    expect(move(feed, 180).defaultPrevented).toBe(false);
    end(feed);
    start(feed);
    move(feed, 180);
    send(feed, 'touchcancel', [], [touch(feed, 230)]);
    end(feed);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    pull(feed, 180);
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
  });

  it('입력·링크·버튼·내부 스크롤을 방해하지 않아야 한다', () => {
    const onRefresh = vi.fn(async () => {});
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <input aria-label="입력" />
        <a href="#feed">링크</a>
        <button type="button">동작</button>
        <div data-testid="scroll">
          <p>안쪽 목록</p>
        </div>
      </PullToRefresh>,
    );
    screen.getByTestId('scroll').scrollTop = 100;
    for (const target of [
      screen.getByRole('textbox'),
      screen.getByRole('link'),
      screen.getByRole('button', { name: '동작' }),
      screen.getByText('안쪽 목록'),
    ]) {
      start(target);
      expect(move(target, 180).defaultPrevented).toBe(false);
      end(target);
    }
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('당기는 도중 콜백이 바뀌면 최신 조회를 실행하고 unmount 뒤 구독을 제거해야 한다', async () => {
    const onFirstRefresh = vi.fn(async () => {});
    const onLatestRefresh = vi.fn(async () => {});
    const { rerender, unmount } = render(
      <PullToRefresh onRefresh={onFirstRefresh}>
        <p>피드</p>
      </PullToRefresh>,
    );
    const feed = screen.getByText('피드');
    start(feed);
    move(feed, 160);
    rerender(
      <PullToRefresh onRefresh={onLatestRefresh}>
        <p>피드</p>
      </PullToRefresh>,
    );
    end(feed);
    await waitFor(() => expect(onLatestRefresh).toHaveBeenCalledOnce());
    expect(onFirstRefresh).not.toHaveBeenCalled();
    unmount();
    pull(feed, 180);
    expect(onLatestRefresh).toHaveBeenCalledOnce();
  });

  it('lock 획득 뒤 조회 시작 전 unmount되면 조회를 실행하지 않아야 한다', async () => {
    const onRefresh = vi.fn(async () => {});
    const { unmount } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>피드</p>
      </PullToRefresh>,
    );
    act(() => {
      fireEvent.click(screen.getByRole('button'));
      unmount();
    });
    await act(async () => undefined);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('진행 중 unmount 뒤에도 작업을 정리하고 새 마운트에서 다시 조회해야 한다', async () => {
    const task = Promise.withResolvers<void>();
    const onRefresh = vi.fn(() => task.promise);
    const { unmount } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>피드</p>
      </PullToRefresh>,
    );
    pull(screen.getByText('피드'), 180);
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    unmount();
    await act(async () => task.resolve());
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>새 피드</p>
      </PullToRefresh>,
    );
    pull(screen.getByText('새 피드'), 180);
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(2));
  });

  it('키보드로 실행하고 실패 뒤 다시 시도할 수 있어야 한다', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined);
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>피드</p>
      </PullToRefresh>,
    );
    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement());
    pull(screen.getByText('피드'), 180);
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(2));
  });
});
