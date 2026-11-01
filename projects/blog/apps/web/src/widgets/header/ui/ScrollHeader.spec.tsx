import { Activity, StrictMode } from 'react';
import Link from 'next/link';

import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleSwitch } from '@/features/locale-switch/ui/locale-switch';

import { ScrollHeader } from './ScrollHeader';

vi.mock('next/navigation', () => ({
  usePathname: () => '/ko/blog/untranslated',
  useRouter: () => ({ push: vi.fn() }),
}));

const scrollDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY');
const heightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight');

function scroll(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
  act(() => fireEvent.scroll(window));
}

beforeEach(() => {
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(4_000);
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  scroll(0);
});

afterEach(() => {
  if (scrollDescriptor) Object.defineProperty(window, 'scrollY', scrollDescriptor);
  if (heightDescriptor) Object.defineProperty(window, 'innerHeight', heightDescriptor);
});

describe('directional site header', () => {
  it('accumulates movement without toggling for small reversals and always returns at the top', () => {
    render(
      <ScrollHeader>
        <Link href="/ko">Home</Link>
      </ScrollHeader>,
    );
    const header = screen.getByRole('banner');
    scroll(100);
    expect(header).toHaveAttribute('data-scroll-hidden', 'true');
    expect(header).toHaveAttribute('inert');
    scroll(96);
    scroll(102);
    scroll(95);
    expect(header).toHaveAttribute('data-scroll-hidden', 'true');
    scroll(94);
    expect(header).not.toHaveAttribute('inert');
    scroll(105);
    expect(header).not.toHaveAttribute('data-scroll-hidden');
    scroll(106);
    expect(header).toHaveAttribute('inert');
    scroll(8);
    expect(header).not.toHaveAttribute('data-scroll-hidden');
  });

  it('uses the same direction rule while a header control is focused and its notice is expanded', async () => {
    render(
      <ScrollHeader>
        <LocaleSwitch locale="ko" />
      </ScrollHeader>,
    );
    const trigger = screen.getByRole('button', { name: /언어 변경/ });
    await userEvent.click(trigger);
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const header = screen.getByRole('banner');
    scroll(100);
    expect(header).toHaveAttribute('inert');
    scroll(92);
    expect(header).not.toHaveAttribute('inert');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('status')).toBeVisible();
  });

  it('clamps elastic overscroll instead of treating its return as a direction change', () => {
    render(<ScrollHeader>Navigation</ScrollHeader>);
    const header = screen.getByRole('banner');
    scroll(3_200);
    scroll(4_000);
    scroll(3_200);
    expect(header).toHaveAttribute('inert');
    scroll(-40);
    expect(header).not.toHaveAttribute('inert');
    scroll(0);
    expect(header).not.toHaveAttribute('data-scroll-hidden');
  });

  it('cleans up StrictMode and Activity subscriptions and reattaches with a visible header', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const tree = (mode: 'visible' | 'hidden') => (
      <StrictMode>
        <Activity mode={mode}>
          <ScrollHeader>
            <Link href="/ko">Home</Link>
          </ScrollHeader>
        </Activity>
      </StrictMode>
    );
    const view = render(tree('visible'));
    scroll(100);
    expect(screen.getByRole('banner')).toHaveAttribute('inert');
    view.rerender(tree('hidden'));
    expect(remove.mock.calls.filter(([event]) => event === 'scroll')).toHaveLength(
      add.mock.calls.filter(([event]) => event === 'scroll').length,
    );
    scroll(200);
    view.rerender(tree('visible'));
    expect(screen.getByRole('banner')).not.toHaveAttribute('inert');
    scroll(212);
    expect(screen.getByRole('banner')).toHaveAttribute('inert');
    view.unmount();
    expect(remove.mock.calls.filter(([event]) => event === 'scroll')).toHaveLength(
      add.mock.calls.filter(([event]) => event === 'scroll').length,
    );
  });
});
