import { describe, expect, it, vi } from 'vitest';

import { act, render, screen } from '@testing-library/react';

import { TableOfContents } from '@/widgets/article-reader/ui/table-of-contents';

describe('article reading aids', () => {
  it('updates the active TOC entry when a real heading enters the viewport and disconnects on unmount', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    let onChange: IntersectionObserverCallback;
    const MockObserver = vi.fn(function (this: object, callback: IntersectionObserverCallback) {
      onChange = callback;
      Object.assign(this, { observe, disconnect });
    });
    vi.stubGlobal('IntersectionObserver', MockObserver);
    const entries = [
      { id: 'first', title: '첫 번째', level: 2 as const },
      { id: 'second', title: '두 번째', level: 3 as const },
    ];
    const result = render(
      <>
        <h2 id="first">First</h2>
        <h3 id="second">Second</h3>
        <TableOfContents entries={entries} locale="ko" />
      </>,
    );
    expect(observe).toHaveBeenCalledTimes(2);
    act(() =>
      onChange(
        [
          {
            isIntersecting: true,
            target: document.getElementById('second')!,
            boundingClientRect: { top: 100 },
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      ),
    );
    for (const link of screen.getAllByRole('link', { name: '두 번째', hidden: true }))
      expect(link).toHaveAttribute('aria-current', 'location');
    expect(screen.getAllByRole('link', { name: '첫 번째', hidden: true })[0]).toHaveAttribute(
      'href',
      '#first',
    );
    result.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
