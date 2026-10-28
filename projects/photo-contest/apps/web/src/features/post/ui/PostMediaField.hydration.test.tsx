import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { expect, it, vi } from 'vitest';

import type { TPostInput, TPostValues } from '../model/post.schema';
import { PostMediaField } from './PostMediaField';

function MediaField() {
  const form = useForm<TPostInput, unknown, TPostValues>({ defaultValues: { media: null, linkUrl: '' } });
  return <PostMediaField control={form.control} trigger={form.trigger} />;
}

it('파일 선택은 ref와 이벤트가 연결된 뒤 첫 클릭으로 실제 input을 연다', async () => {
  const container = document.body.appendChild(document.createElement('div'));
  container.innerHTML = renderToString(<MediaField />);
  const button = within(container).getByRole('button', { name: '파일 선택' });
  expect(button).toBeDisabled();
  const root = await act(async () => hydrateRoot(container, <MediaField />));
  try {
    await waitFor(() => expect(button).toBeEnabled());
    const input = within(container).getByLabelText('사진·동영상 선택');
    const click = vi.spyOn(input, 'click');
    await userEvent.setup().click(button);
    expect(click).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  }
});
