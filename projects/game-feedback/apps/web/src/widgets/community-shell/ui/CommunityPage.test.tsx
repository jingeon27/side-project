import { Activity, type ReactNode } from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CommunityPage } from './CommunityPage';

const navigation = vi.hoisted(() => ({
  pathname: '/ko',
  suspended: false,
  pending: Promise.withResolvers<void>(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => {
    if (navigation.suspended) throw navigation.pending.promise;
    return navigation.pathname;
  },
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/features/auth', () => ({ useSession: () => ({ session: { user: { id: 'same-user' } } }) }));
vi.mock('@/shared/navigation', () => ({
  RouteViewport: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/shared/ui', async () => import('@/shared/ui/ServiceErrorBoundary'));
vi.mock('./CommunityShell', async () => {
  const { createContext } = await import('react');
  return { ChatUnreadContext: createContext(0) };
});
vi.mock('./navigation/LeftSidebar', () => ({ LeftSidebar: () => null }));
vi.mock('./navigation/GameBoardNavigation', () => ({ GameBoardNavigation: () => null }));

function UnstableTopbar({ failed }: { failed: boolean }) {
  if (failed) throw new Error('header render failed');
  return <header>정상 상단 메뉴</header>;
}

beforeEach(() => {
  navigation.pathname = '/ko';
  navigation.suspended = false;
  navigation.pending = Promise.withResolvers<void>();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('CommunityPage header recovery', () => {
  it('preserves header control state when deferred route lookups resolve', async () => {
    function InteractiveHeader() {
      return (
        <header>
          <label>
            언어 메뉴
            <select defaultValue="ko">
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>
          </label>
        </header>
      );
    }
    navigation.suspended = true;
    render(
      <CommunityPage screenKey="feed" locale="ko" topbar={<InteractiveHeader />}>
        정상 본문
      </CommunityPage>,
    );
    fireEvent.change(screen.getByRole('combobox', { name: '언어 메뉴' }), { target: { value: 'en' } });
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '언어 메뉴' }).value).toBe('en');
    await act(async () => {
      navigation.suspended = false;
      navigation.pending.resolve();
    });
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '언어 메뉴' }).value).toBe('en');
  });

  it('clears a failed header on route change for the same account while preserving the body draft', () => {
    const page = (failed: boolean) => (
      <CommunityPage screenKey={navigation.pathname} locale="ko" topbar={<UnstableTopbar failed={failed} />}>
        <input aria-label="본문 초안" defaultValue="" />
      </CommunityPage>
    );
    const { rerender } = render(page(true));
    fireEvent.change(screen.getByRole('textbox', { name: '본문 초안' }), { target: { value: '남길 내용' } });
    expect(screen.getByRole('alert', { name: '상단 메뉴 오류' })).toBeTruthy();
    rerender(page(false));
    expect(screen.queryByText('정상 상단 메뉴')).toBeNull();
    navigation.pathname = '/ko/boards/free';
    rerender(page(false));
    expect(screen.getByText('정상 상단 메뉴')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: '본문 초안' }).value).toBe('남길 내용');
  });

  it('recovers a cached header when returning through Activity without clearing the cached form', async () => {
    const page = (mode: 'visible' | 'hidden', failed: boolean) => (
      <Activity mode={mode}>
        <CommunityPage
          screenKey={navigation.pathname}
          locale="ko"
          topbar={<UnstableTopbar failed={failed} />}
        >
          <input aria-label="보존한 화면 초안" defaultValue="" />
        </CommunityPage>
      </Activity>
    );
    const { rerender } = render(page('visible', true));
    fireEvent.change(screen.getByRole('textbox', { name: '보존한 화면 초안' }), {
      target: { value: 'Activity 초안' },
    });
    navigation.pathname = '/ko/boards/free';
    rerender(page('hidden', false));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    navigation.pathname = '/ko';
    rerender(page('visible', false));
    await screen.findByText('정상 상단 메뉴');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: '보존한 화면 초안' }).value).toBe(
      'Activity 초안',
    );
  });
});
