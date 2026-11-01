import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DesktopNavigation } from './DesktopNavigation';

const navigation = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

describe('DesktopNavigation', () => {
  it.each(['/groups/new', '/groups/example/edit', '/groups/example/write', '/onboarding'])(
    '전용 폼 %s에서는 탐색을 유지하고 푸터는 표시하지 않아야 한다',
    (pathname) => {
      navigation.pathname = pathname;
      render(<DesktopNavigation />);
      expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: '서비스 정책' })).not.toBeInTheDocument();
      expect(screen.queryByText('© 피식')).not.toBeInTheDocument();
    },
  );
  it.each(['/about', '/about/how-it-works'])(
    '공개 랜딩 %s에서는 앱 메뉴를 그리지 않아야 한다',
    (pathname) => {
      navigation.pathname = pathname;
      const { container } = render(<DesktopNavigation />);
      expect(container).toBeEmptyDOMElement();
    },
  );
  it('홈·탐색·MY·알림을 보여 주고 지금 화면만 aria-current="page"여야 한다', () => {
    navigation.pathname = '/explore';
    const { container } = render(<DesktopNavigation />);
    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    expect(container.querySelector('[data-desktop-nav]')).toContainElement(nav);
    expect(screen.getByRole('link', { name: '탐색' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '홈' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'MY' })).toHaveAttribute('href', '/me');
    expect(screen.getByRole('link', { name: '알림' })).toHaveAttribute('href', '/notifications');
    expect(screen.getByRole('navigation', { name: '서비스 정책' })).toBeInTheDocument();
  });

  it('세션을 시작하는 화면에서는 메뉴를 그리지 않아야 한다', () => {
    navigation.pathname = '/sign';
    const { container } = render(<DesktopNavigation />);
    expect(container).toBeEmptyDOMElement();
  });
});
