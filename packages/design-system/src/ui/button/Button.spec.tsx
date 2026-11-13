import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IconButton } from '../icon-button/IconButton';
import { Button } from './Button';
import { ButtonLink } from './ButtonLink';

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

  it('icon은 글자 앞에 두고 진행 중에는 같은 자리를 진행 표시로 바꿔야 한다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Button icon={<svg data-testid="send-icon" aria-hidden />} variant="secondary">
        보내기
      </Button>,
    );
    const button = screen.getByRole('button', { name: '보내기' });
    expect(button.firstElementChild).toBe(screen.getByTestId('send-icon'));
    expect(button.querySelector('[data-motion="loading"]')).toBeNull();

    await user.tab();
    rerender(
      <Button icon={<svg data-testid="send-icon" aria-hidden />} variant="secondary" loading>
        보내기
      </Button>,
    );
    expect(screen.queryByTestId('send-icon')).not.toBeInTheDocument();
    expect(button.firstElementChild).toHaveAttribute('data-slot', 'spinner');
    expect(button.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(button.querySelectorAll('[data-motion="loading"]')).toHaveLength(1);
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveFocus();
    expect(button).toHaveAccessibleName('보내기');
  });

  it('shape를 정하지 않으면 기존 모서리를 쓰고 pill이면 버튼과 링크 모두 알약 모양이어야 한다', () => {
    render(
      <>
        <Button>저장하기</Button>
        <Button variant="accent" size="md" shape="pill">
          그룹 만들기
        </Button>
        <ButtonLink href="/groups/1/write" variant="accent" size="md" shape="pill">
          글쓰기
        </ButtonLink>
      </>,
    );
    const save = screen.getByRole('button', { name: '저장하기' });
    expect(save).toHaveClass('rounded-control');
    expect(save).not.toHaveClass('rounded-full');
    for (const pill of [
      screen.getByRole('button', { name: '그룹 만들기' }),
      screen.getByRole('link', { name: '글쓰기' }),
    ]) {
      expect(pill).toHaveClass('rounded-full', 'bg-accent', 'h-touch');
      expect(pill).not.toHaveClass('rounded-control');
      // 모양 값은 클래스로만 쓰고 DOM 속성으로 넘기지 않는다.
      expect(pill).not.toHaveAttribute('shape');
    }
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
