import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { useZodForm } from '../../../model/form';
import { TextArea, TextField } from './TextField';

const reportSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력해 주세요.'),
  reason: z.string().trim().min(5, '신고 사유를 5자 이상 적어 주세요.'),
});

function ReportForm({ onSubmit }: { onSubmit: () => void }) {
  const form = useZodForm(reportSchema, { defaultValues: { title: '', reason: '' } });
  const { errors } = form.formState;
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <TextField
        label="대회 제목"
        description="20자까지"
        error={errors.title?.message}
        {...form.register('title')}
      />
      <TextArea label="신고 사유" error={errors.reason?.message} {...form.register('reason')} />
      <button type="submit">신고하기</button>
    </form>
  );
}

describe('TextField / TextArea', () => {
  it('필수 입력과 선택 입력을 구분하고 접근성 이름과 required를 유지해야 한다', () => {
    render(
      <>
        <TextField label="제목" required />
        <TextArea label="댓글" required />
        <TextArea label="내용" />
      </>,
    );
    expect(screen.getByRole('textbox', { name: '제목' })).toBeRequired();
    expect(screen.getByRole('textbox', { name: '댓글' })).toBeRequired();
    expect(screen.getByRole('textbox', { name: '내용' })).not.toBeRequired();
    expect(screen.getAllByText('필수')).toHaveLength(2);
    expect(screen.getByText('선택')).toBeVisible();
  });
  it('레이블과 도움말이 입력에 연결돼야 한다', () => {
    render(<TextField label="닉네임" description="2~20자" />);
    const input = screen.getByRole('textbox', { name: '닉네임' });
    expect(input).toHaveAccessibleDescription('2~20자');
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('검증에 실패하면 오류를 읽어 주고 첫 오류 입력으로 포커스를 옮겨야 한다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ReportForm onSubmit={onSubmit} />);

    await user.type(screen.getByRole('textbox', { name: '대회 제목' }), '가을 사진전');
    await user.click(screen.getByRole('button', { name: '신고하기' }));

    const reason = screen.getByRole('textbox', { name: '신고 사유' });
    expect(await screen.findByText('신고 사유를 5자 이상 적어 주세요.')).toBeInTheDocument();
    expect(reason).toHaveAttribute('aria-invalid', 'true');
    expect(reason).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(reason, '부적절한 사진이에요');
    await user.click(screen.getByRole('button', { name: '신고하기' }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  });
});
