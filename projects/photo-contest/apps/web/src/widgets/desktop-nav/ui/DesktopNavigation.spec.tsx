import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MeDocument, type MeQuery } from '@/shared/api/generated';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';

import { DesktopNavigation } from './DesktopNavigation';

const navigation = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/shared/model/analytics', async (original) => ({
  ...(await original<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

function renderNav(me?: MeQuery['me']) {
  const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
  if (me !== undefined) client.writeQuery({ query: MeDocument, data: { me } });
  return render(
    <ApolloProvider client={client}>
      <DesktopNavigation />
    </ApolloProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('DesktopNavigation', () => {
  it.each(['/groups/new', '/groups/example/edit', '/groups/example/write', '/onboarding'])(
    '전용 폼 %s에서는 탐색을 유지하고 푸터는 표시하지 않아야 한다',
    (pathname) => {
      navigation.pathname = pathname;
      renderNav();
      expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: '이용약관' })).not.toBeInTheDocument();
      expect(screen.queryByText('© 피식')).not.toBeInTheDocument();
    },
  );
  it.each(['/about', '/about/how-it-works'])(
    '공개 랜딩 %s에서는 앱 메뉴를 그리지 않아야 한다',
    (pathname) => {
      navigation.pathname = pathname;
      const { container } = renderNav();
      expect(container).toBeEmptyDOMElement();
    },
  );
  it('홈·탐색·MY·알림을 보여 주고 지금 화면만 aria-current="page"여야 한다', () => {
    navigation.pathname = '/explore';
    const { container } = renderNav();
    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    expect(container.querySelector('[data-desktop-nav]')).toContainElement(nav);
    expect(screen.getByRole('link', { name: '탐색' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '홈' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'MY' })).toHaveAttribute('href', '/me');
    expect(screen.getByRole('link', { name: '알림' })).toHaveAttribute('href', '/notifications');
    expect(within(nav).getByRole('link', { name: '이용약관' })).toHaveAttribute('href', '/terms');
  });

  it('main 안의 메뉴는 이름 없는 보조 영역이나 본문과 겹치는 정책 탐색 영역을 만들지 않아야 한다', () => {
    navigation.pathname = '/me';
    renderNav();
    expect(screen.getAllByRole('navigation').map((nav) => nav.getAttribute('aria-label'))).toEqual([
      '주요 메뉴',
    ]);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it.each([
    ['/', '홈'],
    ['/explore', '탐색'],
    ['/me', 'MY'],
    ['/notifications', '알림'],
  ])('%s에서는 %s 아이콘만 굵게 강조해야 한다', (pathname, active) => {
    navigation.pathname = pathname;
    renderNav();
    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    const strokeWidths = Object.fromEntries(
      ['홈', '탐색', 'MY', '알림'].map((name) => [
        name,
        within(nav).getByRole('link', { name }).querySelector('svg')?.getAttribute('stroke-width'),
      ]),
    );
    expect(strokeWidths).toEqual({ 홈: '1.7', 탐색: '1.7', MY: '1.7', 알림: '1.7', [active]: '2.5' });
  });

  it('세션이 없으면 메뉴 이름이 로그인으로 바뀌어 인증 화면으로 가고 클릭을 한 번 기록해야 한다', () => {
    navigation.pathname = '/explore';
    renderNav(null);
    expect(screen.queryByRole('link', { name: 'MY' })).not.toBeInTheDocument();
    const sign = screen.getByRole('link', { name: '로그인' });
    expect(sign).toHaveAttribute('href', '/sign?next=%2Fme');
    sign.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(sign, { ctrlKey: true });
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith(ANALYTICS_EVENT.SignEntryClicked, {
      placement: 'desktop_nav',
      source_path_template: '/explore',
      destination_path_template: '/me',
    });
  });

  it('세션을 시작하는 화면에서는 메뉴를 그리지 않아야 한다', () => {
    navigation.pathname = '/sign';
    const { container } = renderNav();
    expect(container).toBeEmptyDOMElement();
  });
});
