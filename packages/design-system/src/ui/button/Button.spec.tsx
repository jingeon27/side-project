import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IconButton } from '../icon-button/IconButton';
import { Button } from './Button';

describe('Button', () => {
  it('진행 중이면 누를 수 없지만 포커스는 유지하고 진행 상태를 알려야 한다', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        게시물 올리기
      </Button>,
    );
    const button = screen.getByRole('button', { name: '게시물 올리기' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.tab();
    expect(button).toHaveFocus();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('아이콘 버튼에는 화면에 보이지 않는 이름이 있어야 한다', () => {
    render(
      <IconButton label="알림 열기">
        <svg aria-hidden />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: '알림 열기' })).toBeInTheDocument();
  });
});
