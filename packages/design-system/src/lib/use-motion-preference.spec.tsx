import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMotionPreference } from './use-motion-preference';

function Preference() {
  return <output>{useMotionPreference() ? 'reduce' : 'animate'}</output>;
}

function createMedia() {
  const media = Object.assign(new EventTarget(), {
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }) satisfies MediaQueryList;
  vi.spyOn(window, 'matchMedia').mockReturnValue(media);
  return media;
}

afterEach(() => vi.restoreAllMocks());

describe('useMotionPreference', () => {
  it('서버에서는 matchMedia를 읽지 않고 모션 감소를 선택해야 한다', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia');
    expect(renderToString(<Preference />)).toContain('reduce');
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it('첫 hydration을 서버와 맞춘 뒤 현재 기기 설정으로 바꿔야 한다', async () => {
    createMedia();
    const container = document.body.appendChild(document.createElement('div'));
    container.innerHTML = renderToString(<Preference />);
    expect(within(container).getByRole('status')).toHaveTextContent('reduce');
    const onRecoverableError = vi.fn();
    const root = await act(async () => hydrateRoot(container, <Preference />, { onRecoverableError }));
    try {
      expect(within(container).getByRole('status')).toHaveTextContent('animate');
      expect(onRecoverableError).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('설정 변경을 반영하고 StrictMode 재연결과 제거 때 구독을 정리해야 한다', () => {
    const media = createMedia();
    const add = vi.spyOn(media, 'addEventListener');
    const remove = vi.spyOn(media, 'removeEventListener');
    const view = render(
      <StrictMode>
        <Preference />
      </StrictMode>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('animate');
    act(() => {
      media.matches = true;
      media.dispatchEvent(new Event('change'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('reduce');
    act(() => {
      media.matches = false;
      media.dispatchEvent(new Event('change'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('animate');
    view.unmount();
    const subscriptions = add.mock.calls.filter(([type]) => type === 'change');
    const removals = remove.mock.calls.filter(([type]) => type === 'change');
    expect(subscriptions.length).toBeGreaterThan(0);
    expect(removals.map(([, listener]) => listener)).toEqual(subscriptions.map(([, listener]) => listener));
  });
});
