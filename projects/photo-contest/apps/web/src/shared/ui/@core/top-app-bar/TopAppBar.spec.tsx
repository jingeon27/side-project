import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getParentRoute, routeHistoryStore } from '../../../model/router';
import { HomeAppBar, TopAppBar } from './TopAppBar';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  forward: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/contests/c1',
}));

beforeEach(() => {
  vi.clearAllMocks();
  routeHistoryStore.start('navigate');
});

describe('TopAppBar', () => {
  it('제목을 화면의 h1으로, 오른쪽 행동을 함께 보여 줘야 한다', () => {
    render(
      <TopAppBar title="가을 사진전" backHref="/groups/g1" actions={<button type="button">공유</button>} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: '가을 사진전' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '공유' })).toBeInTheDocument();
  });

  it('화면 머리만 그리고 전역 메뉴는 레이아웃에 맡겨야 한다', () => {
    const { container } = render(<TopAppBar title="가을 사진전" />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(container.querySelector('[data-desktop-nav]')).toBeNull();
  });

  it('앱 안 기록이 없으면(링크로 바로 들어옴) 상위 화면으로 가야 한다', async () => {
    const user = userEvent.setup();
    render(<TopAppBar title="가을 사진전" backHref="/groups/g1" />);
    await user.click(screen.getByRole('button', { name: '뒤로 가기' }));
    expect(router.push).toHaveBeenCalledWith('/groups/g1', undefined);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('앱 안 기록이 있으면 이전 화면으로 돌아가야 한다', async () => {
    const user = userEvent.setup();
    routeHistoryStore.record('/contests/c1');
    render(<TopAppBar title="가을 사진전" backHref="/groups/g1" />);
    await user.click(screen.getByRole('button', { name: '뒤로 가기' }));
    expect(router.back).toHaveBeenCalledOnce();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('앱(안드로이드) 뒤로 가기도 같은 상위 화면을 쓰도록 등록해야 한다', () => {
    const { unmount } = render(<TopAppBar title="가을 사진전" backHref="/groups/g1" />);
    expect(getParentRoute('/contests/c1')).toBe('/groups/g1');
    unmount();
    expect(getParentRoute('/contests/c1')).toBe('/');
  });

  it('뒤로 갈 곳이 없으면 뒤로 가기 버튼을 그리지 않아야 한다', () => {
    render(<HomeAppBar />);
    expect(screen.getByRole('heading', { level: 1, name: '홈' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '홈' })).toHaveTextContent('피식');
    expect(screen.queryByRole('button', { name: '뒤로 가기' })).not.toBeInTheDocument();
  });
});
