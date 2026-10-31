import { StrictMode } from 'react';

import 'lottie-web/build/player/lottie_light';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StatusAnimationPlayer } from './motion-player';
import { StatusAnimation } from './StatusAnimation';

const { loadAnimation } = vi.hoisted(() => ({ loadAnimation: vi.fn() }));
vi.mock('lottie-web/build/player/lottie_light', () => ({ default: { loadAnimation } }));

class MotionPreference extends EventTarget {
  matches = false;

  change(reduced: boolean) {
    this.matches = reduced;
    this.dispatchEvent(new Event('change'));
  }
}

function player() {
  return {
    isLoaded: true,
    play: vi.fn(),
    pause: vi.fn(),
    destroy: vi.fn(),
    addEventListener: vi.fn<(name: string, callback: () => void) => void>(),
    removeEventListener: vi.fn(),
  };
}

const preference = new MotionPreference();

beforeEach(() => {
  preference.matches = false;
  vi.stubGlobal('matchMedia', () => preference);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 64, 64));
  loadAnimation.mockImplementation(player);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  loadAnimation.mockReset();
});

describe('상태 모션의 브라우저 수명', () => {
  it('인스턴스의 반복 시작과 종료는 플레이어를 중복 생성하거나 정리하지 않아야 한다', async () => {
    const view = render(<span data-testid="motion-host" />);
    const controller = new StatusAnimationPlayer(screen.getByTestId('motion-host'), {
      variant: 'loading',
      loop: true,
      onReady: vi.fn(),
    });
    controller.start();
    controller.start();
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledOnce());
    const current = loadAnimation.mock.results[0]?.value;
    controller.destroy();
    controller.destroy();
    controller.start();
    await act(async () => {});
    expect(current.destroy).toHaveBeenCalledOnce();
    expect(loadAnimation).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('초기화 도중 실패해도 이미 연결한 플레이어와 이벤트를 정리해야 한다', async () => {
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(function () {
        throw new Error('observer failed');
      }),
    );
    const view = render(<StatusAnimation variant="error" />);
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledOnce());
    const current = loadAnimation.mock.results[0]?.value;
    await waitFor(() => expect(current.destroy).toHaveBeenCalledOnce());
    expect(view.container.querySelector('[data-motion-fallback]')).not.toHaveClass('invisible');
    expect(current.removeEventListener).toHaveBeenCalledTimes(3);
    fireEvent(document, new Event('visibilitychange'));
    expect(current.play).not.toHaveBeenCalled();
    view.unmount();
    expect(current.destroy).toHaveBeenCalledOnce();
  });
  it('모션 감소 설정에서는 플레이어를 만들지 않고 설정이 바뀌면 다시 연결해야 한다', async () => {
    preference.matches = true;
    const view = render(<StatusAnimation variant="empty" label="비어 있어요" />);
    expect(loadAnimation).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-motion-player]')).toBeNull();
    act(() => preference.change(false));
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledOnce());
    const current = loadAnimation.mock.results[0]?.value;
    await waitFor(() => expect(current.play).toHaveBeenCalled());
    act(() => preference.change(true));
    expect(current.destroy).toHaveBeenCalledOnce();
    expect(view.container.querySelector('[data-motion-fallback]')).toBeVisible();
    expect(screen.getByRole('img', { name: '비어 있어요' })).toBeVisible();
    act(() => preference.change(false));
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledTimes(2));
  });

  it('화면 밖과 숨겨진 탭에서는 멈추고 돌아오면 재개해야 한다', async () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    const createObserver = vi.fn(function (_notify: IntersectionObserverCallback) {
      return {
        observe,
        disconnect,
        unobserve: vi.fn(),
        takeRecords: () => [],
        root: null,
        rootMargin: '0px',
        thresholds: [0],
      };
    });
    vi.stubGlobal('IntersectionObserver', createObserver);
    const view = render(<StatusAnimation variant="loading" />);
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledOnce());
    const current = loadAnimation.mock.results[0]?.value;
    await waitFor(() => expect(current.play).toHaveBeenCalled());
    const observer = createObserver.mock.results[0]?.value;
    const notify = createObserver.mock.calls[0]?.[0];
    const node = observe.mock.calls[0]?.[0];
    act(() => notify?.([{ target: node, isIntersecting: false } as IntersectionObserverEntry], observer));
    expect(current.pause).toHaveBeenCalledOnce();
    act(() => notify?.([{ target: node, isIntersecting: true } as IntersectionObserverEntry], observer));
    expect(current.play).toHaveBeenCalledTimes(2);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(current.pause).toHaveBeenCalledTimes(2);
    hidden.mockReturnValue(false);
    fireEvent(document, new Event('visibilitychange'));
    expect(current.play).toHaveBeenCalledTimes(3);
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(current.destroy).toHaveBeenCalledOnce();
    fireEvent(document, new Event('visibilitychange'));
    expect(current.play).toHaveBeenCalledTimes(3);
  });

  it('종류 변경은 이전 플레이어를 정리하고 새 그림이 준비될 때까지 fallback을 유지해야 한다', async () => {
    const view = render(<StatusAnimation variant="success" />);
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledOnce());
    const previous = loadAnimation.mock.results[0]?.value;
    const pending = player();
    pending.isLoaded = false;
    loadAnimation.mockReturnValueOnce(pending);
    view.rerender(<StatusAnimation variant="error" />);
    expect(previous.destroy).toHaveBeenCalledOnce();
    expect(view.container.querySelector('[data-motion-fallback]')).toBeVisible();
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledTimes(2));
    pending.isLoaded = true;
    act(() => pending.addEventListener.mock.calls.find(([name]) => name === 'DOMLoaded')?.[1]());
    expect(view.container.querySelector('[data-motion-fallback]')).toHaveClass('invisible');
    expect(view.container.querySelector('[data-motion-player]')).not.toHaveClass('invisible');
  });

  it('로딩 실패는 정지 그림으로 돌아가고 정리 뒤 늦은 이벤트를 무시해야 한다', async () => {
    const view = render(<StatusAnimation variant="error" fallback={<span>정지 그림</span>} />);
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledOnce());
    const current = loadAnimation.mock.results[0]?.value;
    const fail = current.addEventListener.mock.calls.find(([name]: [string]) => name === 'data_failed')?.[1];
    act(() => fail?.());
    expect(screen.getByText('정지 그림')).toBeVisible();
    expect(current.destroy).toHaveBeenCalledOnce();
    view.unmount();
    act(() => fail?.());
    expect(current.destroy).toHaveBeenCalledOnce();
  });

  it('청크를 기다리는 동안 사라진 노드에는 플레이어를 만들지 않아야 한다', async () => {
    const view = render(<StatusAnimation variant="empty" />);
    view.unmount();
    await act(async () => {});
    expect(loadAnimation).not.toHaveBeenCalled();
  });

  it('StrictMode 재연결에서도 살아 있는 플레이어만 남기고 마지막에 한 번 정리해야 한다', async () => {
    const view = render(
      <StrictMode>
        <StatusAnimation variant="game" />
      </StrictMode>,
    );
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledOnce());
    const current = loadAnimation.mock.results[0]?.value;
    view.unmount();
    expect(current.destroy).toHaveBeenCalledOnce();
    expect(current.removeEventListener).toHaveBeenCalledTimes(3);
  });
});
