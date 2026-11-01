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

async function scroll(y: number) {
  await act(async () => {
    document.documentElement.scrollTop = y;
    fireEvent.scroll(
      document.scrollingElement === document.documentElement ? window : document.documentElement,
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

beforeEach(() => {
  document.documentElement.scrollTop = 0;
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(4_000);
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800);
});

afterEach(() => {
  document.documentElement.scrollTop = 0;
});

describe('directional site header', () => {
  it('accumulates movement without toggling for small reversals and always returns at the top', async () => {
    render(
      <ScrollHeader>
        <Link href="/ko">Home</Link>
      </ScrollHeader>,
    );
    const header = screen.getByRole('banner');
    await scroll(100);
    expect(header).toHaveAttribute('data-scroll-hidden', 'true');
    expect(header).toHaveAttribute('inert');
    await scroll(96);
    await scroll(102);
    await scroll(95);
    expect(header).toHaveAttribute('data-scroll-hidden', 'true');
    await scroll(94);
    expect(header).not.toHaveAttribute('inert');
    await scroll(105);
    expect(header).not.toHaveAttribute('data-scroll-hidden');
    await scroll(106);
    expect(header).toHaveAttribute('inert');
    await scroll(8);
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
    await scroll(100);
    expect(header).toHaveAttribute('inert');
    await scroll(92);
    expect(header).not.toHaveAttribute('inert');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('status')).toBeVisible();
  });

  it('clamps elastic overscroll instead of treating its return as a direction change', async () => {
    render(<ScrollHeader>Navigation</ScrollHeader>);
    const header = screen.getByRole('banner');
    await scroll(3_200);
    await scroll(4_000);
    await scroll(3_200);
    expect(header).toHaveAttribute('inert');
    await scroll(-40);
    expect(header).not.toHaveAttribute('inert');
    await scroll(0);
    expect(header).not.toHaveAttribute('data-scroll-hidden');
  });

  it('cleans up StrictMode and Activity subscriptions and reattaches with a visible header', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const addRoot = vi.spyOn(document.documentElement, 'addEventListener');
    const removeRoot = vi.spyOn(document.documentElement, 'removeEventListener');
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
    await scroll(100);
    const header = screen.getByRole('banner');
    expect(header).toHaveAttribute('inert');
    view.rerender(tree('hidden'));
    expect(
      [...remove.mock.calls, ...removeRoot.mock.calls].filter(([event]) => event === 'scroll'),
    ).toHaveLength([...add.mock.calls, ...addRoot.mock.calls].filter(([event]) => event === 'scroll').length);
    await scroll(200);
    expect(header).toHaveAttribute('inert');
    view.rerender(tree('visible'));
    expect(screen.getByRole('banner')).not.toHaveAttribute('inert');
    await scroll(212);
    expect(screen.getByRole('banner')).toHaveAttribute('inert');
    view.unmount();
    await scroll(0);
    expect(header).toHaveAttribute('inert');
    const subscriptions = [...add.mock.calls, ...addRoot.mock.calls].filter(([event]) => event === 'scroll');
    expect(subscriptions.length).toBeGreaterThan(0);
    expect(
      [...remove.mock.calls, ...removeRoot.mock.calls].filter(([event]) => event === 'scroll'),
    ).toHaveLength(subscriptions.length);
  });
});
