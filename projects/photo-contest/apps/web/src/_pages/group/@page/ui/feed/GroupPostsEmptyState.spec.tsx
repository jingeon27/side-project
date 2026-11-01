import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { GroupRole } from '@/shared/api/generated';

import { GroupPostsEmptyState } from './GroupPostsEmptyState';

describe('그룹의 빈 게시물 안내', () => {
  it('빈 카테고리에서 전체 목록으로 돌아가며 다른 URL 상태를 보존해야 한다', async () => {
    window.history.replaceState(null, '', '/groups/group-1?category=empty&sort=latest&tag=a&tag=b#posts');
    render(<GroupPostsEmptyState group={{ id: 'group-1', role: GroupRole.Member }} categoryId="empty" />);
    await userEvent.click(screen.getByRole('button', { name: '전체 게시물 보기' }));
    expect(window.location.pathname).toBe('/groups/group-1');
    expect(window.location.search).toBe('?sort=latest&tag=a&tag=b');
    expect(window.location.hash).toBe('#posts');
  });

  it('멤버에게만 현재 그룹의 첫 작성으로 바로 가는 링크를 제공해야 한다', () => {
    const { rerender } = render(
      <GroupPostsEmptyState group={{ id: 'group-1', role: GroupRole.Member }} categoryId={null} />,
    );
    expect(screen.getByRole('link', { name: '첫 게시물 쓰기' })).toHaveAttribute(
      'href',
      '/groups/group-1/write',
    );
    rerender(<GroupPostsEmptyState group={{ id: 'group-1', role: null }} categoryId={null} />);
    expect(screen.queryByRole('link', { name: '첫 게시물 쓰기' })).not.toBeInTheDocument();
    expect(screen.getByText('그룹에 가입하고 첫 이야기를 남겨보세요.')).toBeVisible();
  });
});
