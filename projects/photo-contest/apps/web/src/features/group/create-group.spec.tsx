// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing/react';
import { CreateGroup } from './create-group';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(cleanup);
describe('그룹 생성 폼', () => {
  it('빈 이름을 제출하면 오류를 표시하고 입력을 수정할 수 있어야 한다', async () => {
    const user = userEvent.setup();
    render(
      <MockedProvider>
        <CreateGroup />
      </MockedProvider>,
    );
    await user.click(screen.getByRole('button', { name: '그룹 만들기' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '그룹 만들기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('그룹 이름을 입력해 주세요.');
    await user.type(screen.getByLabelText('그룹 이름'), '웃음 메이트');
    expect(screen.getByLabelText('그룹 이름')).toHaveValue('웃음 메이트');
  });
  it('Escape 키로 닫으면 그룹 생성 버튼으로 포커스를 돌려야 한다', async () => {
    const user = userEvent.setup();
    render(
      <MockedProvider>
        <CreateGroup />
      </MockedProvider>,
    );
    const trigger = screen.getByRole('button', { name: '그룹 만들기' });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
