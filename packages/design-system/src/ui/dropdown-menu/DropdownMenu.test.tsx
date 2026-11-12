import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';

import { focusRingOf } from '../../test/tailwind-theme';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './DropdownMenu';

it('방향키로 포커스를 옮긴 항목은 전역 포커스 링을 지우지 않고 안쪽에 그려야 한다', async () => {
  const user = userEvent.setup();
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>댓글 메뉴</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>수정</DropdownMenuItem>
        <DropdownMenuItem variant="danger">삭제</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  screen.getByRole('button', { name: '댓글 메뉴' }).focus();

  await user.keyboard('{ArrowDown}');
  const items = await screen.findAllByRole('menuitem');
  await waitFor(() => expect(items[0]).toHaveFocus());
  await user.keyboard('{ArrowDown}');
  expect(items[1]).toHaveFocus();
  // 강조 배경은 팝업 바탕과 약 1.1:1이라 링이 유일한 위치 표시다. 팝업 여백 밖으로 그리면 overflow에 잘린다.
  for (const item of items) {
    const ring = await focusRingOf(item);
    expect(ring.hidden).toBe(false);
    expect(ring.outerEdge).toBeLessThanOrEqual(0);
  }
});
