import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BottomNav } from './BottomNav';

const navigation = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

describe('BottomNav', () => {
  it('홈·탐색·MY를 보여 주고 지금 화면의 탭만 aria-current="page"여야 한다', () => {
    navigation.pathname = '/me';
    render(<BottomNav />);
    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    expect(nav).toHaveAttribute('data-bottom-nav');
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: '홈' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'MY' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '탐색' })).toHaveAttribute('href', '/explore');
    expect(screen.getByRole('link', { name: '탐색' })).not.toHaveAttribute('aria-current');
  });

  it('홈에서는 홈 탭이 현재 탭이어야 한다', () => {
    navigation.pathname = '/';
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'MY' })).toHaveAttribute('href', '/me');
  });
});
