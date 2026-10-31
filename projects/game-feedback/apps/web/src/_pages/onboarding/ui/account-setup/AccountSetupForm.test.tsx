import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NicknameSchema } from '@game-feedback/contracts';

import { AccountSetupForm } from './AccountSetupForm';

function renderForm() {
  const onSubmit = vi.fn();
  render(<AccountSetupForm submitLabel="가입 완료하기" pending={false} onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole('checkbox', { name: /이용약관/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: '만 14세 이상입니다.' }));
  return onSubmit;
}

describe('sign-up nickname length', () => {
  // 가입이 20자에서 잘려 계약(최대 24자)과 프로필 수정이 허용하는 닉네임을 받지 못했다.
  it.each([21, 24])('accepts a %i-character nickname that the contract allows', async (length) => {
    const nickname = '가'.repeat(length);
    expect(NicknameSchema.safeParse(nickname).success).toBe(true);
    const onSubmit = renderForm();
    const input = screen.getByLabelText<HTMLInputElement>('서비스 닉네임');
    expect(input.maxLength).toBe(24);
    fireEvent.change(input, { target: { value: nickname } });
    fireEvent.click(screen.getByRole('button', { name: '가입 완료하기' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ nickname });
  });

  it('rejects a nickname longer than the contract with the contract range in the message', async () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText('서비스 닉네임'), { target: { value: '가'.repeat(25) } });
    fireEvent.click(screen.getByRole('button', { name: '가입 완료하기' }));
    expect((await screen.findByRole('alert')).textContent).toBe('2~24자로 입력해 주세요');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
