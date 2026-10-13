import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { useZodForm } from './form.hook';

const nicknameSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(2, '닉네임은 2자 이상 입력해 주세요.')
    .max(20, '닉네임은 20자까지 쓸 수 있어요.'),
});

function NicknameForm({ onSubmit }: { onSubmit: (values: z.output<typeof nicknameSchema>) => void }) {
  const form = useZodForm(nicknameSchema, { defaultValues: { nickname: '' } });
  const error = form.formState.errors.nickname?.message;
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <label htmlFor="nickname">닉네임</label>
      <input id="nickname" aria-invalid={Boolean(error)} {...form.register('nickname')} />
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit">시작하기</button>
    </form>
  );
}

describe('useZodForm', () => {
  it('스키마를 통과하지 못하면 제출하지 않고 스키마의 안내문을 보여 줘야 한다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<NicknameForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('닉네임'), ' 김 ');
    await user.click(screen.getByRole('button', { name: '시작하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('닉네임은 2자 이상 입력해 주세요.');
    expect(screen.getByLabelText('닉네임')).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('통과하면 스키마가 변환한 값(output)으로 제출해야 한다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<NicknameForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('닉네임'), '  웃긴친구  ');
    await user.click(screen.getByRole('button', { name: '시작하기' }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ nickname: '웃긴친구' });
  });
});
