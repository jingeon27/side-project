import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { expect, it, vi } from 'vitest';

import type { TPostInput, TPostValues } from '../../../model/post.schema';
import { PostMediaField } from './PostMediaField';

function MediaField({ fieldKey }: { fieldKey?: string }) {
  const form = useForm<TPostInput, unknown, TPostValues>({ defaultValues: { media: null, linkUrl: '' } });
  return (
    <>
      <PostMediaField key={fieldKey} control={form.control} trigger={form.trigger} />
      <button type="button" onClick={() => form.setFocus('media')}>
        입력으로 이동
      </button>
    </>
  );
}

it('파일 선택은 ref와 이벤트가 연결된 뒤 첫 클릭으로 실제 input을 연다', async () => {
  const container = document.body.appendChild(document.createElement('div'));
  container.innerHTML = renderToString(<MediaField />);
  const button = within(container).getByRole('button', { name: '파일 선택' });
  expect(button).toBeDisabled();
  const root = await act(async () => hydrateRoot(container, <MediaField />));
  try {
    await waitFor(() => expect(button).toBeEnabled());
    const input = within(container).getByLabelText('사진 또는 동영상 선택');
    const click = vi.spyOn(input, 'click');
    await userEvent.setup().click(button);
    expect(click).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  }
});

it('StrictMode와 노드 교체 뒤 파일 선택과 폼 포커스가 새 입력을 사용해야 한다', async () => {
  const { rerender, unmount } = render(
    <StrictMode>
      <MediaField fieldKey="first" />
    </StrictMode>,
  );
  const previous = screen.getByLabelText('사진 또는 동영상 선택');
  rerender(
    <StrictMode>
      <MediaField fieldKey="second" />
    </StrictMode>,
  );
  const current = screen.getByLabelText('사진 또는 동영상 선택');
  expect(current).not.toBe(previous);
  const click = vi.spyOn(current, 'click');
  try {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '파일 선택' }));
    expect(click).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: '입력으로 이동' }));
    expect(current).toHaveFocus();
  } finally {
    unmount();
    vi.restoreAllMocks();
  }
});
