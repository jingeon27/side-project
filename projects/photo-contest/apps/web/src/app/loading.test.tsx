import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/_app/shell';

import Loading from './loading';

vi.mock('next/navigation', () => ({
  usePathname: () => '/groups/group-1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

describe('라우트 로딩 회귀', () => {
  it('다음 화면을 불러오는 동안에도 데스크톱 고정 메뉴를 유지해야 한다', () => {
    const { container } = render(
      <AppShell>
        <Loading />
      </AppShell>,
    );
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toBeInTheDocument();
    // #pc-main은 이 표시가 있을 때 메뉴 폭만큼 비켜 그리므로, 로딩 중에도 본문이 옆으로 밀리지 않는다.
    expect(container.querySelectorAll('[data-desktop-nav]')).toHaveLength(1);
  });
});
