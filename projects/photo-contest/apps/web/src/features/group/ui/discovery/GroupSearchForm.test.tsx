import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GroupSearchForm } from './GroupSearchForm';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

beforeEach(() => {
  navigation.replace.mockReset();
  window.history.replaceState(null, '', '/explore');
});

describe('그룹 검색 초기값', () => {
  it('URL의 q를 등록된 입력의 초기값으로 사용해야 한다', () => {
    window.history.replaceState(null, '', '/explore?q=산책');
    render(<GroupSearchForm />);
    expect(screen.getByRole('textbox', { name: '그룹 검색' })).toHaveValue('산책');
  });
});

describe('검색 폼 hydration', () => {
  it.each([true, false])('hydration 전후 입력(%s)의 검색어를 register로 제출해야 한다', async (before) => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<GroupSearchForm />);
    document.body.append(container);
    const input = within(container).getByRole('textbox', { name: '그룹 검색' }) as HTMLInputElement;
    expect(within(container).queryByText('선택')).not.toBeInTheDocument();
    if (before) input.value = '상자 복어';
    const root = hydrateRoot(container, <GroupSearchForm />);
    try {
      await act(async () => {});
      if (!before) await userEvent.type(input, '상자 복어');
      expect(input.value).toBe('상자 복어');
      fireEvent.submit(within(container).getByRole('search'));
      await waitFor(() =>
        expect(navigation.replace).toHaveBeenCalledWith(
          '/explore?q=%EC%83%81%EC%9E%90+%EB%B3%B5%EC%96%B4',
          undefined,
        ),
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});

describe('그룹 검색 URL 병합', () => {
  it.each([' 새 검색 ', ''])(
    '검색어(%s)만 바꾸고 다른 필터·상세 키·중복 키·hash를 보존해야 한다',
    async (value) => {
      window.history.replaceState(null, '', '/explore?q=old&group=g1&detail=post-1&tag=a&tag=b#results');
      render(<GroupSearchForm />);
      fireEvent.change(screen.getByRole('textbox', { name: '그룹 검색' }), { target: { value } });
      fireEvent.submit(screen.getByRole('search'));
      await waitFor(() => expect(navigation.replace).toHaveBeenCalledOnce());
      const url = new URL(navigation.replace.mock.calls[0]?.[0], window.location.origin);
      expect(url.pathname).toBe('/explore');
      expect(url.searchParams.get('q')).toBe(value.trim() || null);
      expect(url.searchParams.get('group')).toBe('g1');
      expect(url.searchParams.get('detail')).toBe('post-1');
      expect(url.searchParams.getAll('tag')).toEqual(['a', 'b']);
      expect(url.hash).toBe('#results');
    },
  );
});
