import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './DropdownMenu';

function ChatMenu({ onReport }: { onReport: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>대화 메뉴</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={onReport}>신고하기</DropdownMenuItem>
        <DropdownMenuItem variant="destructive">대화 내역 삭제</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

it('키보드로 열고 이동하며 Escape로 닫으면 트리거로 포커스를 돌려야 한다', async () => {
  const user = userEvent.setup();
  render(<ChatMenu onReport={vi.fn()} />);
  const trigger = screen.getByRole('button', { name: '대화 메뉴' });
  trigger.focus();

  await user.keyboard('{ArrowDown}');
  const menu = await screen.findByRole('menu');
  const [report, remove] = screen.getAllByRole('menuitem');
  await waitFor(() => expect(report).toHaveFocus());
  await user.keyboard('{ArrowDown}');
  expect(remove).toHaveFocus();
  expect(remove).toHaveAttribute('data-variant', 'destructive');

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
