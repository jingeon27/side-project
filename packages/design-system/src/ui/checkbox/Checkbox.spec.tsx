import { useId } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Controller, useForm } from 'react-hook-form';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';

import { Button } from '../button/Button';
import { Checkbox } from './Checkbox';

const schema = z.object({ acceptedTerms: z.boolean().refine(Boolean, '약관에 동의해 주세요') });
type TValues = z.infer<typeof schema>;

function TermsForm({ onSubmit }: { onSubmit: (values: TValues) => void }) {
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { acceptedTerms: false } });
  const checkboxId = useId();
  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <label htmlFor={checkboxId} className="flex items-center gap-2">
        <Controller
          name="acceptedTerms"
          control={form.control}
          render={({ field, fieldState }) => (
            <Checkbox
              id={checkboxId}
              name={field.name}
              checked={field.value}
              onCheckedChange={field.onChange}
              onBlur={field.onBlur}
              inputRef={field.ref}
              aria-invalid={fieldState.invalid || undefined}
            />
          )}
        />
        이용약관에 동의합니다
      </label>
      {form.formState.errors.acceptedTerms ? (
        <p role="alert">{form.formState.errors.acceptedTerms.message}</p>
      ) : null}
      <Button type="submit">가입</Button>
    </form>
  );
}

it('RHF Controller의 boolean 필드와 연결되어 검증 오류를 표시하고 체크 값을 제출해야 한다', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<TermsForm onSubmit={onSubmit} />);
  const checkbox = screen.getByRole('checkbox', { name: '이용약관에 동의합니다' });

  await user.click(screen.getByRole('button', { name: '가입' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('약관에 동의해 주세요');
  expect(checkbox).toHaveAttribute('aria-invalid', 'true');
  expect(onSubmit).not.toHaveBeenCalled();

  await user.click(screen.getByText('이용약관에 동의합니다'));
  expect(checkbox).toBeChecked();
  await user.click(screen.getByRole('button', { name: '가입' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  expect(onSubmit.mock.calls[0]?.[0]).toEqual({ acceptedTerms: true });
});
