import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './DropdownMenu';

function ChatMenu({
  onReport = () => undefined,
  align,
}: {
  onReport?: () => void;
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>대화 메뉴</DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuItem onClick={onReport}>신고하기</DropdownMenuItem>
        <DropdownMenuItem variant="danger">대화 내역 삭제</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

it('키보드로 열고 이동하며 Escape로 닫으면 트리거로 포커스를 돌려야 한다', async () => {
  const user = userEvent.setup();
  render(<ChatMenu onReport={() => undefined} />);
  const trigger = screen.getByRole('button', { name: '대화 메뉴' });
  trigger.focus();

  await user.keyboard('{ArrowDown}');
  const menu = await screen.findByRole('menu');
  const [report, remove] = screen.getAllByRole('menuitem');
  await waitFor(() => expect(report).toHaveFocus());
  await user.keyboard('{ArrowDown}');
  expect(remove).toHaveFocus();
  expect(remove).toHaveAttribute('data-variant', 'danger');

  await user.keyboard('{Escape}');
  await waitFor(() => expect(menu).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});

it('항목을 Enter로 고르면 동작을 실행하고 메뉴를 닫아야 한다', async () => {
  const user = userEvent.setup();
  const onReport = vi.fn();
  render(<ChatMenu onReport={onReport} />);
  const trigger = screen.getByRole('button', { name: '대화 메뉴' });

  await user.click(trigger);
  await screen.findByRole('menu');
  await user.keyboard('{ArrowDown}');
  await waitFor(() => expect(screen.getByRole('menuitem', { name: '신고하기' })).toHaveFocus());
  await user.keyboard('{Enter}');

  expect(onReport).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});

it('메뉴 안의 항목이 아닌 곳을 누르면 열어 두고 바깥을 누르면 닫아야 한다', async () => {
  const user = userEvent.setup();
  render(<ChatMenu />);
  const trigger = screen.getByRole('button', { name: '대화 메뉴' });

  await user.click(trigger);
  const menu = await screen.findByRole('menu');
  await user.click(menu);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(menu).toBeInTheDocument();

  await user.click(document.body);
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
});

it.each([
  { name: '정렬을 넘기지 않으면 시작', align: undefined, expected: 'start' },
  { name: 'align="end"를 넘기면 끝', align: 'end', expected: 'end' },
] as const)('$name 쪽에 맞춰 트리거 아래에 열어야 한다', async ({ align, expected }) => {
  const user = userEvent.setup();
  render(<ChatMenu align={align} />);

  await user.click(screen.getByRole('button', { name: '대화 메뉴' }));
  const menu = await screen.findByRole('menu');
  expect(menu).toHaveAttribute('data-side', 'bottom');
  expect(menu).toHaveAttribute('data-align', expected);
});
