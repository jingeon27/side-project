import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MeDocument, type MeQuery } from '@/shared/api/generated';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';

import { BottomNav } from './BottomNav';

const navigation = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/shared/model/analytics', async (original) => ({
  ...(await original<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

const USER: NonNullable<MeQuery['me']> = {
  __typename: 'User',
  id: 'user-1',
  nickname: '웃음 친구',
  avatar: null,
  needsOnboarding: false,
  isAnonymous: false,
};

function buildNav(me?: MeQuery['me']) {
  const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
  if (me !== undefined) client.writeQuery({ query: MeDocument, data: { me } });
  return (
    <ApolloProvider client={client}>
      <BottomNav />
    </ApolloProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('BottomNav', () => {
  it('홈·탐색·MY를 보여 주고 지금 화면의 탭만 aria-current="page"여야 한다', () => {
    navigation.pathname = '/me';
    render(buildNav(USER));
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
    render(buildNav(USER));
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'MY' })).toHaveAttribute('href', '/me');
  });

  it('세션이 없으면 메뉴 이름이 로그인으로 바뀌어 인증 화면으로 가고 클릭을 한 번 기록해야 한다', () => {
    navigation.pathname = '/groups/group-1';
    render(buildNav(null));
    expect(screen.queryByRole('link', { name: 'MY' })).not.toBeInTheDocument();
    const sign = screen.getByRole('link', { name: '로그인' });
    expect(sign).toHaveAttribute('href', '/sign?next=%2Fme');
    sign.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(sign, { ctrlKey: true });
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith(ANALYTICS_EVENT.SignEntryClicked, {
      placement: 'bottom_nav',
      source_path_template: '/groups/:id',
      destination_path_template: '/me',
    });
  });

  it('익명 세션과 회원의 MY는 내 화면으로 가고 인증 진입을 기록하지 않아야 한다', () => {
    navigation.pathname = '/';
    render(buildNav({ ...USER, isAnonymous: true }));
    const my = screen.getByRole('link', { name: 'MY' });
    expect(my).toHaveAttribute('href', '/me');
    my.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(my, { ctrlKey: true });
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('세션 여부를 아직 모르면 MY로 표시하고 내 화면으로 가야 한다', () => {
    navigation.pathname = '/';
    render(buildNav());
    expect(screen.getByRole('link', { name: 'MY' })).toHaveAttribute('href', '/me');
  });

  it('세션이 없어도 서버 HTML과 맞춘 뒤 hydration이 끝나면 로그인으로 바뀌어야 한다', async () => {
    navigation.pathname = '/';
    const ui = buildNav(null);
    const container = document.body.appendChild(document.createElement('div'));
    container.innerHTML = renderToString(ui);
    const my = within(container).getByRole('link', { name: 'MY' });
    expect(my).toHaveAttribute('href', '/me');
    const recoverable = vi.fn();
    const root = await act(async () => hydrateRoot(container, ui, { onRecoverableError: recoverable }));
    try {
      await waitFor(() => expect(my).toHaveAttribute('href', '/sign?next=%2Fme'));
      expect(my).toHaveTextContent('로그인');
      expect(recoverable).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
