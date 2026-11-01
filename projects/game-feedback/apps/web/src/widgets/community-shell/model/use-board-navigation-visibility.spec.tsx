import { Activity, StrictMode } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBoardNavigationVisibility } from './use-board-navigation-visibility';

const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')!;
const position = { top: 0 };

function Navigation() {
  const { ref, hidden } = useBoardNavigationVisibility();
  return (
    <div ref={ref} data-testid="navigation" data-hidden={hidden} inert={hidden}>
      <button>분류</button>
    </div>
  );
}

function scrollTo(top: number) {
  position.top = top;
  fireEvent.scroll(window);
}

beforeEach(() => {
  position.top = 0;
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => position.top });
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(3000);
});

afterEach(() => {
  Object.defineProperty(window, 'scrollY', originalScrollY);
  vi.restoreAllMocks();
});

describe('board navigation scroll direction', () => {
  it('hides after 12px down, stays hidden at rest and reveals after 8px up without jitter', () => {
    render(<Navigation />);
    const navigation = screen.getByTestId('navigation');
    scrollTo(11);
    expect(navigation.getAttribute('data-hidden')).toBe('false');
    scrollTo(12);
    expect(navigation.hasAttribute('inert')).toBe(true);
    scrollTo(30);
    scrollTo(25);
    scrollTo(28);
    expect(navigation.getAttribute('data-hidden')).toBe('true');
    scrollTo(22);
    expect(navigation.getAttribute('data-hidden')).toBe('false');
    fireEvent.scroll(window);
    expect(navigation.hasAttribute('inert')).toBe(false);
  });

  it('uses the same direction rule with keyboard focus and clamps elastic overscroll', () => {
    render(<Navigation />);
    const navigation = screen.getByTestId('navigation');
    act(() => screen.getByRole('button', { name: '분류' }).focus());
    scrollTo(100);
    expect(navigation.getAttribute('data-hidden')).toBe('true');
    scrollTo(10_000);
    scrollTo(9000);
    expect(navigation.getAttribute('data-hidden')).toBe('true');
    scrollTo(8);
    expect(navigation.getAttribute('data-hidden')).toBe('false');
    scrollTo(-30);
    scrollTo(4);
    expect(navigation.getAttribute('data-hidden')).toBe('false');
  });

  it('reconnects through Activity and removes its passive listener on detach', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const content = (mode: 'visible' | 'hidden') => (
      <StrictMode>
        <Activity mode={mode}>
          <Navigation />
        </Activity>
      </StrictMode>
    );
    const view = render(content('visible'));
    scrollTo(100);
    expect(screen.getByTestId('navigation').getAttribute('data-hidden')).toBe('true');
    view.rerender(content('hidden'));
    view.rerender(content('visible'));
    expect(screen.getByTestId('navigation').getAttribute('data-hidden')).toBe('false');
    scrollTo(112);
    expect(screen.getByTestId('navigation').getAttribute('data-hidden')).toBe('true');
    view.unmount();
    const subscriptions = add.mock.calls.filter(([type]) => type === 'scroll');
    const removals = remove.mock.calls.filter(([type]) => type === 'scroll');
    expect(subscriptions.length).toBeGreaterThan(0);
    expect(
      subscriptions.every(([, , options]) => options && typeof options === 'object' && options.passive),
    ).toBe(true);
    expect(removals).toHaveLength(subscriptions.length);
  });
});
