import { render, screen } from '@testing-library/react';
import { Images, Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './EmptyState';

describe('빈 화면의 맥락별 아이콘', () => {
  it('조회가 끝난 뒤에도 게시물과 그룹 아이콘을 공통 애니메이션으로 교체하지 않아야 한다', () => {
    const { container, rerender } = render(<EmptyState title="게시물이 없어요" icon={<Images />} />);
    expect(screen.getByText('게시물이 없어요')).toBeVisible();
    expect(container.querySelector('.lucide-images')).toBeVisible();
    rerender(<EmptyState title="그룹이 없어요" icon={<Users />} />);
    expect(screen.getByText('그룹이 없어요')).toBeVisible();
    expect(container.querySelector('.lucide-users')).toBeVisible();
    expect(container.querySelector('.lucide-images')).not.toBeInTheDocument();
  });
});
