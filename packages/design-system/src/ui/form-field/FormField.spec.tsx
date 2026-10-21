import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';

import { Button } from '../button/Button';
import { Input } from '../input/Input';
import { NativeSelect, NativeSelectOption } from '../native-select/NativeSelect';
import { Textarea } from '../textarea/Textarea';
import { FormField } from './FormField';

const schema = z.object({
  title: z.string().min(4, '제목을 확인해주세요'),
  board: z.string().min(1),
  body: z.string().min(10),
});
type TValues = z.infer<typeof schema>;
function Composer({ onSubmit }: { onSubmit: (values: TValues) => void }) {
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { title: '', board: '', body: '' } });
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FormField label="제목" hint="글의 제목" error={form.formState.errors.title?.message}>
        <Input {...form.register('title')} />
      </FormField>
      <FormField label="분류">
        <NativeSelect {...form.register('board')}>
          <NativeSelectOption value="">선택</NativeSelectOption>
          <NativeSelectOption value="FRIEND_SALE">친추판매</NativeSelectOption>
        </NativeSelect>
      </FormField>
      <FormField label="내용">
        <Textarea {...form.register('body')} />
      </FormField>
      <Button type="submit">등록</Button>
    </form>
  );
}
it('shadcn 입력의 레이블과 오류, RHF ref를 연결하고 선택한 값을 제출해야 한다', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<Composer onSubmit={onSubmit} />);
  await user.click(screen.getByRole('button', { name: '등록' }));
  const title = screen.getByRole('textbox', { name: '제목' });
  await waitFor(() => expect(title).toHaveFocus());
  expect(title).toHaveAttribute('aria-invalid', 'true');
  expect(title).toHaveAccessibleDescription('글의 제목 제목을 확인해주세요');
  await user.type(title, '친추판매 모집');
  await user.selectOptions(screen.getByRole('combobox', { name: '분류' }), 'FRIEND_SALE');
  await user.type(
    screen.getByRole('textbox', { name: '내용' }),
    '친구 슬롯의 판매 조건과 기간을 알려드립니다.',
  );
  await user.click(screen.getByRole('button', { name: '등록' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  expect(onSubmit.mock.calls[0]?.[0]).toEqual({
    title: '친추판매 모집',
    board: 'FRIEND_SALE',
    body: '친구 슬롯의 판매 조건과 기간을 알려드립니다.',
  });
});
