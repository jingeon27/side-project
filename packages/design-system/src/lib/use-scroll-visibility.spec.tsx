import { Activity, StrictMode } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useScrollVisibility } from './use-scroll-visibility';

function Navigation() {
  const { ref, hidden } = useScrollVisibility<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="navigation" data-hidden={hidden} inert={hidden}>
      <button>분류</button>
    </div>
  );
}

async function scrollTo(top: number) {
  await act(async () => {
    document.documentElement.scrollTop = top;
    fireEvent.scroll(document.scrollingElement ? window : document.documentElement);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

beforeEach(() => {
  document.documentElement.scrollTop = 0;
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(3000);
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(768);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('scroll visibility', () => {
  it('hides after 12px down, stays hidden at rest and reveals after 8px up without jitter', async () => {
    render(<Navigation />);
    const navigation = screen.getByTestId('navigation');
    await scrollTo(11);
    expect(navigation.getAttribute('data-hidden')).toBe('false');
    await scrollTo(12);
    expect(navigation.hasAttribute('inert')).toBe(true);
    await scrollTo(30);
    await scrollTo(25);
    await scrollTo(28);
    expect(navigation.getAttribute('data-hidden')).toBe('true');
    await scrollTo(22);
    expect(navigation.getAttribute('data-hidden')).toBe('false');
    await scrollTo(22);
    expect(navigation.hasAttribute('inert')).toBe(false);
  });

  it('uses the same direction rule with keyboard focus and clamps elastic overscroll', async () => {
    render(<Navigation />);
    const navigation = screen.getByTestId('navigation');
    act(() => screen.getByRole('button', { name: '분류' }).focus());
    await scrollTo(100);
    expect(navigation.getAttribute('data-hidden')).toBe('true');
    await scrollTo(10_000);
    await scrollTo(9000);
    expect(navigation.getAttribute('data-hidden')).toBe('true');
    await scrollTo(8);
    expect(navigation.getAttribute('data-hidden')).toBe('false');
    await scrollTo(-30);
    await scrollTo(4);
    expect(navigation.getAttribute('data-hidden')).toBe('false');
  });

  it('reconnects through Activity and cleans up Motion subscriptions on detach', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const addRoot = vi.spyOn(document.documentElement, 'addEventListener');
    const removeRoot = vi.spyOn(document.documentElement, 'removeEventListener');
    const content = (mode: 'visible' | 'hidden') => (
      <StrictMode>
        <Activity mode={mode}>
          <Navigation />
        </Activity>
      </StrictMode>
    );
    const view = render(content('visible'));
    await scrollTo(100);
    const navigation = screen.getByTestId('navigation');
    expect(navigation.getAttribute('data-hidden')).toBe('true');
    view.rerender(content('hidden'));
    expect(
      [...remove.mock.calls, ...removeRoot.mock.calls].filter(([type]) => type === 'scroll'),
    ).toHaveLength([...add.mock.calls, ...addRoot.mock.calls].filter(([type]) => type === 'scroll').length);
    await scrollTo(112);
    expect(navigation.getAttribute('data-hidden')).toBe('true');
    view.rerender(content('visible'));
    expect(screen.getByTestId('navigation').getAttribute('data-hidden')).toBe('false');
    await scrollTo(124);
    expect(screen.getByTestId('navigation').getAttribute('data-hidden')).toBe('true');
    view.unmount();
    await scrollTo(0);
    expect(navigation.getAttribute('data-hidden')).toBe('true');
    const subscriptions = [...add.mock.calls, ...addRoot.mock.calls].filter(([type]) => type === 'scroll');
    const removals = [...remove.mock.calls, ...removeRoot.mock.calls].filter(([type]) => type === 'scroll');
    expect(subscriptions.length).toBeGreaterThan(0);
    expect(removals).toHaveLength(subscriptions.length);
  });
});
