import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PasswordAuthForms } from './PasswordAuthForms';

function renderForms(defaultTab?: 'login' | 'register') {
  const user = userEvent.setup();
  render(
    <MockedProvider>
      <PasswordAuthForms nextPath="/" defaultTab={defaultTab} />
    </MockedProvider>,
  );
  return { user };
}

describe('PasswordAuthForms', () => {
  it('이름 있는 탭 목록에서 로그인 탭과 그 패널을 먼저 보여 줘야 한다', () => {
    renderForms();
    const tabs = screen.getByRole('tablist', { name: '아이디 로그인 방식' });
    expect(within(tabs).getByRole('tab', { name: '로그인', selected: true })).toBeVisible();
    expect(within(tabs).getByRole('tab', { name: '회원가입', selected: false })).toBeVisible();
    const login = screen.getByRole('tabpanel', { name: '로그인' });
    expect(within(login).getByRole('button', { name: '아이디로 로그인' })).toBeVisible();
    expect(screen.queryByRole('tabpanel', { name: '회원가입' })).not.toBeInTheDocument();
  });

  it('방향키로 탭을 옮기고 Enter로 회원가입 패널을 열어야 한다', async () => {
    const { user } = renderForms();
    await user.tab();
    expect(screen.getByRole('tab', { name: '로그인' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: '회원가입' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('tab', { name: '회원가입', selected: true })).toBeVisible();
    const register = screen.getByRole('tabpanel', { name: '회원가입' });
    expect(within(register).getByRole('button', { name: '가입하고 시작하기' })).toBeVisible();
    expect(screen.queryByRole('tabpanel', { name: '로그인' })).not.toBeInTheDocument();
  });
});
