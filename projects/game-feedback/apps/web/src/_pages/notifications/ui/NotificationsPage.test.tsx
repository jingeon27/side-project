import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { NotificationsPage } from './NotificationsPage';

const failure = vi.hoisted(() => ({ list: false }));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ session: { user: { id: 'viewer' } } }),
}));
vi.mock('@/widgets/community-shell', () => ({
  CommunityPage: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/features/push-notifications', () => ({
  PushNotificationSettings: () => <input aria-label="앱 알림 설정" defaultValue="" />,
}));
vi.mock('@tanstack/react-query', async () => ({
  ...(await vi.importActual('@tanstack/react-query')),
  useSuspenseInfiniteQuery: () => {
    if (failure.list) throw new Error('notification list failed');
    return { data: { pages: [{ items: [], unreadCount: 0 }] } };
  },
}));

beforeEach(() => {
  failure.list = false;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

it('알림 목록이 실패해도 제목과 앱 알림 설정을 보존해야 한다', () => {
  const client = new QueryClient();
  const content = (
    <QueryClientProvider client={client}>
      <NotificationsPage locale="ko" />
    </QueryClientProvider>
  );
  const { rerender } = render(content);
  fireEvent.change(screen.getByLabelText('앱 알림 설정'), { target: { value: '유지할 설정' } });
  failure.list = true;
  rerender(
    <QueryClientProvider client={client}>
      <NotificationsPage locale="ko" />
    </QueryClientProvider>,
  );
  expect(screen.getByRole('alert', { name: '내 알림 오류' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: '새로운 시선이 도착했어요' })).toBeTruthy();
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: '앱 알림 설정' }).value).toBe('유지할 설정');
});
