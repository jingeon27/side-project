import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';

import { PublicStartLink } from './PublicStartLink';

const navigation = vi.hoisted(() => ({ search: vi.fn(), pathname: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: navigation.search,
  usePathname: navigation.pathname,
}));
vi.mock('@/shared/model/analytics', async (original) => ({
  ...(await original<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  navigation.pathname.mockReturnValue('/about');
  navigation.search.mockReturnValue(new URLSearchParams());
});

it('그룹 진입 클릭을 한 번 기록하고 쿼리와 해시, 원본 URL은 이벤트에서 제외한다', () => {
  const groupId = 'clx12345678901234567890123';
  const destination = `/groups/${groupId}?q=private-search#invite-token`;
  navigation.search.mockReturnValue(new URLSearchParams({ redirect: destination }));
  render(<PublicStartLink placement="hero">피식 시작하기</PublicStartLink>);
  const link = screen.getByRole('link', { name: '피식 시작하기' });
  expect(link).toHaveAttribute('href', destination);
  link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  fireEvent.click(link, { ctrlKey: true });
  expect(trackEvent).toHaveBeenCalledExactlyOnceWith(ANALYTICS_EVENT.LandingStartClicked, {
    placement: 'hero',
    source_path_template: '/about',
    destination_path_template: '/groups/:id',
    redirect_applied: true,
    group_id: groupId,
  });
});

it.each([null, 'https://outside.example', '//outside.example', '/sign?next=/groups/target'])(
  'redirect %s는 기본 홈으로 안내하고 그룹 속성을 만들지 않는다',
  (redirect) => {
    navigation.search.mockReturnValue(new URLSearchParams(redirect ? { redirect } : {}));
    render(<PublicStartLink placement="header">시작하기</PublicStartLink>);
    const link = screen.getByRole('link', { name: '시작하기' });
    expect(link).toHaveAttribute('href', '/');
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(link, { ctrlKey: true });
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith(ANALYTICS_EVENT.LandingStartClicked, {
      placement: 'header',
      source_path_template: '/about',
      destination_path_template: '/',
      redirect_applied: false,
    });
  },
);
