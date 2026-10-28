import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GroupSearchForm } from './GroupSearchForm';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
describe('검색 폼 hydration', () => {
  it.each([true, false])('hydration 전 입력/브라우저 복원(%s)의 검색어를 보존해야 한다', async (before) => {
    navigation.replace.mockReset();
    const container = document.createElement('div');
    container.innerHTML = renderToString(<GroupSearchForm />);
    document.body.append(container);
    const input = within(container).getByRole('textbox', { name: '그룹 검색' }) as HTMLInputElement;
    expect(within(container).queryByText('선택')).not.toBeInTheDocument();
    if (before) input.value = '상자 복어';
    const root = hydrateRoot(container, <GroupSearchForm />);
    try {
      await act(async () => {});
      if (!before) input.value = '상자 복어';
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
