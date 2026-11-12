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
    expect(likeToggleVariants({ density: 'inline' })).toContain('text-caption');
    expect(likeToggleVariants({ density: 'card' })).toContain('aria-pressed:bg-danger-soft');
    expect(likeIconVariants({ density: 'inline' })).toBe('size-4');
    expect(likeIconVariants({ density: 'chip' })).toBe('size-5');
  });

  it('게시물 카드와 이전 대회 칩은 알약 모양, 댓글 줄은 버튼 기본 모서리로 그려야 한다', () => {
    render(
      <>
        <LikeToggle density="card" liked={false} label="카드 좋아요">
          1
        </LikeToggle>
        <LikeToggle density="chip" liked={false} label="칩 좋아요">
          1
        </LikeToggle>
        <LikeToggle density="inline" liked={false} label="댓글 좋아요">
          1
        </LikeToggle>
      </>,
    );
    expect(screen.getByRole('button', { name: '카드 좋아요' })).toHaveClass('rounded-full');
    expect(screen.getByRole('button', { name: '칩 좋아요' })).toHaveClass('rounded-full');
    expect(screen.getByRole('button', { name: '댓글 좋아요' })).toHaveClass('rounded-control');
    expect(screen.getByRole('button', { name: '댓글 좋아요' })).not.toHaveClass('rounded-full');
  });
});

describe('LikeCount', () => {
  it('누를 수 없는 자리에서는 버튼 없이 수만 보여주고 화면 낭독기에는 같은 이름을 글자로 읽혀야 한다', () => {
    const { container } = render(
      <LikeCount density="inline" liked label="댓글 좋아요 2개">
        2
      </LikeCount>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // 이름 글자에도 수가 들어 있으므로 보이는 수는 정확히 일치하는 요소로 찾는다.
    expect(screen.getByText('2', { exact: true })).toHaveAttribute('aria-hidden', 'true');
    // 역할 없는 요소의 aria-label은 읽히지 않으므로 이름은 숨기지 않은 글자로 있어야 한다.
    expect(container.querySelector('[aria-label]')).toBeNull();
    expect(screen.getByText('댓글 좋아요 2개').closest('[aria-hidden="true"]')).toBeNull();
  });
});
