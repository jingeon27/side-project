import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { ANALYTICS_EVENT, trackEvent } from '@/shared/analytics';

import { LandingStartLink } from './LandingStartLink';

const navigation = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: navigation.search }));
vi.mock('@/shared/analytics', () => ({
  ANALYTICS_EVENT: { LandingStartClicked: 'landing_start_clicked' },
  trackEvent: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  navigation.search.mockReturnValue(new URLSearchParams());
});

it.each(['header', 'hero', 'footer'] as const)(
  '%s의 클릭을 한 번 기록하고 게시글 ID와 원본 URL은 보내지 않는다',
  (placement) => {
    navigation.search.mockReturnValue(
      new URLSearchParams({ redirect: '/ko/posts/private-post-id?board=free' }),
    );
    render(<LandingStartLink placement={placement} />);
    const link = screen.getByRole('link', { name: '시작하기' });
    expect(link.getAttribute('href')).toBe('/ko/posts/private-post-id?board=free');
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(link);
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith(ANALYTICS_EVENT.LandingStartClicked, {
      placement,
      destination_screen: 'post',
      redirect_applied: true,
    });
  },
);

it('외부 목적지로 나가지 않고 기본 홈 진입 속성을 기록한다', () => {
  navigation.search.mockReturnValue(new URLSearchParams({ redirect: '//outside.example/private-token' }));
  render(<LandingStartLink placement="hero" />);
  const link = screen.getByRole('link', { name: '시작하기' });
  expect(link.getAttribute('href')).toBe('/ko');
  link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  fireEvent.click(link);
  expect(trackEvent).toHaveBeenCalledExactlyOnceWith(ANALYTICS_EVENT.LandingStartClicked, {
    placement: 'hero',
    destination_screen: 'feed',
    redirect_applied: false,
  });
});
