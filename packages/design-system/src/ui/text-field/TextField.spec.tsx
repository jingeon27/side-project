import { createRef } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { Button } from '../button/Button';
import { FormField } from '../form-field/FormField';
import { TextAreaField, TextField } from './TextField';

const contentSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력해 주세요.'),
  body: z.string().trim().min(5, '내용을 5자 이상 적어 주세요.'),
});

function ContentForm({ onSubmit }: { onSubmit: () => void }) {
  const form = useForm<z.infer<typeof contentSchema>>({
    resolver: zodResolver(contentSchema),
    defaultValues: { title: '', body: '' },
  });
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <TextField
        label="제목"
        description="80자까지"
        error={form.formState.errors.title?.message}
        {...form.register('title')}
      />
      <TextAreaField label="내용" error={form.formState.errors.body?.message} {...form.register('body')} />
      <Button type="submit">등록하기</Button>
    </form>
  );
}

describe('TextField / TextAreaField', () => {
  it('검증 오류를 입력과 연결하고 첫 오류 입력으로 포커스를 옮겨야 한다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ContentForm onSubmit={onSubmit} />);
    const title = screen.getByRole('textbox', { name: '제목' });
    expect(title).toHaveAccessibleDescription('80자까지');
    await user.type(title, '플레이 이야기');
    await user.click(screen.getByRole('button', { name: '등록하기' }));
    const body = screen.getByRole('textbox', { name: '내용' });
    expect(await screen.findByText('내용을 5자 이상 적어 주세요.')).toBeInTheDocument();
    expect(body).toHaveAttribute('aria-invalid', 'true');
    expect(body).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.type(body, '함께 나누는 이야기');
    await user.click(screen.getByRole('button', { name: '등록하기' }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  });

  it('FormField와 같은 Input·Textarea로 조립하고 labelSuffix는 이름에서 빼야 한다', () => {
    const inputRef = createRef<HTMLInputElement>();
    const textareaRef = createRef<HTMLTextAreaElement>();
    render(
      <>
        <TextField
          ref={inputRef}
          label="닉네임"
          description="2~12자"
          labelSuffix={<span aria-hidden="true">필수</span>}
          required
        />
        <TextAreaField ref={textareaRef} label="소개" description="자유롭게 적어 주세요" />
      </>,
    );
    const nickname = screen.getByRole('textbox', { name: '닉네임' });
    expect(nickname).toHaveAttribute('data-slot', 'input');
    expect(nickname).toHaveAccessibleDescription('2~12자');
    expect(nickname).toBeRequired();
    expect(inputRef.current).toBe(nickname);
    expect(screen.getByText('필수')).toBeVisible();

    const intro = screen.getByRole('textbox', { name: '소개' });
    expect(intro).toHaveAttribute('data-slot', 'textarea');
    expect(intro).toHaveAttribute('rows', '4');
    expect(intro).toHaveClass('field-sizing-fixed', 'resize-none');
    expect(textareaRef.current).toBe(intro);
  });
});

describe('FormField', () => {
  it('native 입력의 ref와 명시적 이름을 유지하며 도움말과 오류를 연결해야 한다', () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <FormField label="플레이어 태그" description="#으로 시작해요" error="태그를 확인해 주세요">
        <input ref={ref} aria-label="연결할 태그" />
      </FormField>,
    );
    const input = screen.getByRole('textbox', { name: '연결할 태그' });
    expect(ref.current).toBe(input);
    expect(input).toHaveAccessibleDescription('#으로 시작해요 태그를 확인해 주세요');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('태그를 확인해 주세요');
  });
});
