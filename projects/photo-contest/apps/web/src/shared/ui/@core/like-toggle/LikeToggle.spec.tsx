import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { likeIconVariants, likeToggleVariants } from './like-toggle.variants';
import { LikeCount, LikeToggle } from './LikeToggle';

describe('LikeToggle', () => {
  it('접근성 이름으로 읽히고 눌림 상태를 aria-pressed로 알려야 한다', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(
      <LikeToggle liked={false} label="점심의 순간 좋아요" onClick={onClick}>
        좋아요 3개
      </LikeToggle>,
    );
    const button = screen.getByRole('button', { name: '점심의 순간 좋아요' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('좋아요 3개');
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();

    rerender(
      <LikeToggle liked label="점심의 순간 좋아요" onClick={onClick}>
        좋아요 4개
      </LikeToggle>,
    );
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button.querySelector('svg')).toHaveClass('fill-current');
  });

  it('누를 수 없으면 disabled로 그리고 설명을 연결해야 한다', () => {
    render(
      <>
        <LikeToggle density="chip" liked={false} label="좋아요 1개" disabled aria-describedby="hint">
          1
        </LikeToggle>
        <span id="hint">내 사진에는 좋아요를 누를 수 없어요</span>
      </>,
    );
    const button = screen.getByRole('button', { name: '좋아요 1개' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('내 사진에는 좋아요를 누를 수 없어요');
  });

  it('자리별 밀도는 버튼과 하트 크기를 함께 바꿔야 한다', () => {
    expect(likeToggleVariants({ density: 'inline' })).toContain('text-micro');
    expect(likeToggleVariants({ density: 'card' })).toContain('aria-pressed:bg-danger-soft');
    expect(likeIconVariants({ density: 'inline' })).toBe('size-4');
    expect(likeIconVariants({ density: 'chip' })).toBe('size-5');
  });
});

describe('LikeCount', () => {
  it('누를 수 없는 자리에서는 버튼 없이 수만 같은 이름으로 보여줘야 한다', () => {
    render(
      <LikeCount density="inline" liked label="댓글 좋아요 2개">
        2
      </LikeCount>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByLabelText('댓글 좋아요 2개')).toHaveTextContent('2');
  });
});
