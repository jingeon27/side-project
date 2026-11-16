import { Activity, StrictMode } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FloatingComposeButton } from './FloatingComposeButton';

afterEach(() => vi.useRealTimers());

describe('floating compose entry', () => {
  it('keeps its accessible name and action while scrolling, then restores after the last scroll', () => {
    vi.useFakeTimers();
    const onCompose = vi.fn();
    render(<FloatingComposeButton onCompose={onCompose} />);
    const button = screen.getByRole('button', { name: '글쓰기' });
    expect(button.hasAttribute('data-scrolling')).toBe(false);

    fireEvent.scroll(window);
    expect(button.getAttribute('data-scrolling')).toBe('true');
    act(() => vi.advanceTimersByTime(150));
    fireEvent.scroll(window);
    act(() => vi.advanceTimersByTime(150));
    expect(button.getAttribute('data-scrolling')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '글쓰기' }));
    expect(onCompose).toHaveBeenCalledOnce();

    act(() => vi.advanceTimersByTime(30));
    expect(button.hasAttribute('data-scrolling')).toBe(false);
  });

  it('reconnects once in StrictMode and removes the listener and pending idle timer on unmount', () => {
    vi.useFakeTimers();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = render(
      <StrictMode>
        <FloatingComposeButton onCompose={vi.fn()} />
      </StrictMode>,
    );
    const subscriptions = add.mock.calls.filter(([event]) => event === 'scroll');
    const removals = () => remove.mock.calls.filter(([event]) => event === 'scroll');
    expect(subscriptions).toHaveLength(2);
    expect(removals()).toHaveLength(1);
    expect(subscriptions[1]?.[2]).toEqual({ passive: true });

    fireEvent.scroll(window);
    view.unmount();
    expect(removals()).toHaveLength(2);
    expect(removals()[1]?.[1]).toBe(subscriptions[1]?.[1]);
    expect(vi.getTimerCount()).toBe(0);
    add.mockRestore();
    remove.mockRestore();
  });

  it('restores the idle label after a scrolling screen is hidden and shown by Activity', () => {
    vi.useFakeTimers();
    const onCompose = vi.fn();
    const renderEntry = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <FloatingComposeButton onCompose={onCompose} />
      </Activity>
    );
    const view = render(renderEntry('visible'));
    fireEvent.scroll(window);
    expect(screen.getByRole('button', { name: '글쓰기' }).getAttribute('data-scrolling')).toBe('true');
    view.rerender(renderEntry('hidden'));
    act(() => vi.advanceTimersByTime(180));
    view.rerender(renderEntry('visible'));
    act(() => vi.advanceTimersByTime(180));
    expect(screen.getByRole('button', { name: '글쓰기' }).hasAttribute('data-scrolling')).toBe(false);
  });
});
