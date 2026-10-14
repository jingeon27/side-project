import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EmptyState } from '../empty-state';
import { ErrorState } from '../error-state';
import { IconButton } from '../icon-button';
import { Button } from './Button';

describe('Button', () => {
  it('진행 중이면 누를 수 없지만 포커스는 유지하고 진행 중임을 알려야 한다', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        사진 제출하기
      </Button>,
    );
    const button = screen.getByRole('button', { name: '사진 제출하기' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');

    await user.tab();
    expect(button).toHaveFocus();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('아이콘 버튼은 보이지 않는 이름(aria-label)으로 불려야 한다', () => {
    render(
      <IconButton label="대회 링크 공유">
        <svg aria-hidden />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: '대회 링크 공유' })).toBeInTheDocument();
  });
});

describe('EmptyState / ErrorState', () => {
  it('빈 화면은 안내와 다음 행동을 보여 줘야 한다', () => {
    render(
      <EmptyState
        title="아직 그룹이 없어요"
        description="그룹을 만들고 친구를 초대해 보세요."
        action={<button type="button">그룹 만들기</button>}
      />,
    );
    expect(screen.getByText('아직 그룹이 없어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '그룹 만들기' })).toBeInTheDocument();
  });

  it('오류 화면은 알림으로 읽히고 다시 시도할 수 있어야 한다', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState message="네트워크 연결을 확인하고 다시 시도해 주세요." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('불러오지 못했어요');
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
