import { StrictMode } from 'react';

import { Autocomplete } from '@base-ui/react/autocomplete';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ArticleSearch } from './article-search';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(vi.unstubAllGlobals);

describe('ArticleSearch callback ref', () => {
  it('검색어·언어가 바뀌어도 연결된 노드의 단축키 구독을 교체하지 않아야 한다', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { rerender } = render(<ArticleSearch locale="ko" value="" onChange={vi.fn()} articles={[]} />);
    const input = screen.getByRole('combobox');
    add.mockClear();
    remove.mockClear();
    rerender(<ArticleSearch locale="en" value="react" onChange={vi.fn()} articles={[]} />);
    expect(screen.getByRole('combobox')).toBe(input);
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0);
    expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0);
    const focus = vi.spyOn(input, 'focus');
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(focus).toHaveBeenCalledOnce();
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('입력 노드 교체 후 새 노드만 포커스하고 unmount 뒤에는 단축키를 해제해야 한다', () => {
    const { rerender, unmount } = render(
      <ArticleSearch key="first" locale="ko" value="" onChange={vi.fn()} articles={[]} />,
    );
    const previous = screen.getByRole('combobox');
    const previousFocus = vi.spyOn(previous, 'focus');
    rerender(<ArticleSearch key="next" locale="ko" value="" onChange={vi.fn()} articles={[]} />);
    const input = screen.getByRole('combobox');
    const focus = vi.spyOn(input, 'focus');
    expect(input).not.toBe(previous);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(previousFocus).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledOnce();
    expect(input).toHaveFocus();
    unmount();
    focus.mockClear();
    expect(fireEvent.keyDown(document, { key: 'k', metaKey: true })).toBe(true);
    expect(focus).not.toHaveBeenCalled();
    expect(previousFocus).not.toHaveBeenCalled();
  });

  it('StrictMode 재연결 뒤에도 단축키가 한 번만 동작하고 unmount 때 정리되어야 한다', () => {
    const { unmount } = render(
      <StrictMode>
        <ArticleSearch locale="ko" value="" onChange={vi.fn()} articles={[]} />
      </StrictMode>,
    );
    const input = screen.getByRole('combobox');
    const focus = vi.spyOn(input, 'focus');
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(focus).toHaveBeenCalledOnce();
    unmount();
    focus.mockClear();
    expect(fireEvent.keyDown(document, { key: 'k', ctrlKey: true })).toBe(true);
    expect(focus).not.toHaveBeenCalled();
  });

  it('실제 Autocomplete.Input의 병합 ref가 노드 교체·해제 시 React 19 cleanup을 실행해야 한다', () => {
    const handleCleanup = vi.fn();
    const handleInputRef = vi.fn((input: HTMLInputElement | null) => {
      if (input) return handleCleanup;
    });
    const { rerender, unmount } = render(
      <Autocomplete.Root>
        <Autocomplete.Input ref={handleInputRef} render={<input key="first" />} />
      </Autocomplete.Root>,
    );
    const first = screen.getByRole('combobox');
    expect(handleInputRef).toHaveBeenLastCalledWith(first);
    expect(handleCleanup).not.toHaveBeenCalled();
    rerender(
      <Autocomplete.Root>
        <Autocomplete.Input ref={handleInputRef} render={<input key="next" />} />
      </Autocomplete.Root>,
    );
    const next = screen.getByRole('combobox');
    expect(next).not.toBe(first);
    expect(handleCleanup).toHaveBeenCalledOnce();
    expect(handleInputRef).toHaveBeenLastCalledWith(next);
    unmount();
    expect(handleCleanup).toHaveBeenCalledTimes(2);
  });
});
