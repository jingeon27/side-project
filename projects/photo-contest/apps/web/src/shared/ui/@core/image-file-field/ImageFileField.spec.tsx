import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { useZodForm } from '../../../model/form';
import { ImageFileField } from './ImageFileField';

const schema = z.object({
  photo: z
    .instanceof(File)
    .nullable()
    .refine((file) => !file || file.type === 'image/png', 'PNG 사진을 선택해 주세요.'),
  removePhoto: z.boolean(),
});

const submitted = vi.fn();

beforeEach(() => {
  submitted.mockReset();
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:picked');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

function PhotoForm({ currentUrl }: { currentUrl?: string }) {
  const form = useZodForm(schema, { defaultValues: { photo: null, removePhoto: false } });
  return (
    <form noValidate onSubmit={form.handleSubmit((values) => submitted(values))}>
      <ImageFileField
        control={form.control}
        trigger={form.trigger}
        name="photo"
        removeName="removePhoto"
        label="테스트 사진"
        currentUrl={currentUrl}
        fileSchema={schema.shape.photo}
      />
      <button type="submit">저장</button>
    </form>
  );
}

const png = () => new File(['png'], 'photo.png', { type: 'image/png' });

describe('ImageFileField', () => {
  it('고른 사진을 미리 보여 주고 그 파일로 제출해야 한다', async () => {
    const user = userEvent.setup();
    render(<PhotoForm currentUrl="/backend/media/current" />);
    expect(screen.getByRole('img', { name: '테스트 사진 미리보기' })).toHaveAttribute(
      'src',
      '/backend/media/current',
    );
    const file = png();
    await user.upload(screen.getByLabelText('테스트 사진 선택'), file);
    expect(screen.getByRole('img', { name: '테스트 사진 미리보기' })).toHaveAttribute('src', 'blob:picked');

    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(submitted).toHaveBeenCalledWith({ photo: file, removePhoto: false }));
  });

  it('형식이 맞지 않으면 미리보기 없이 바로 오류를 알려야 한다', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<PhotoForm />);
    const input = screen.getByLabelText('테스트 사진 선택');
    await user.upload(input, new File(['gif'], 'photo.gif', { type: 'image/gif' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('PNG 사진을 선택해 주세요.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('img', { name: '테스트 사진 미리보기' })).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('사진을 지우면 저장된 사진도 숨기고 삭제로 제출하며, 다시 고르면 삭제를 취소해야 한다', async () => {
    const user = userEvent.setup();
    render(<PhotoForm currentUrl="/backend/media/current" />);
    await user.click(screen.getByRole('button', { name: '사진 삭제' }));
    expect(screen.queryByRole('img', { name: '테스트 사진 미리보기' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(submitted).toHaveBeenLastCalledWith({ photo: null, removePhoto: true }));

    const file = png();
    await user.upload(screen.getByLabelText('테스트 사진 선택'), file);
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(submitted).toHaveBeenLastCalledWith({ photo: file, removePhoto: false }));
  });
});
