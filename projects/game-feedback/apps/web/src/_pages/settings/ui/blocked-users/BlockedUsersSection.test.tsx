import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Author } from '@/shared/api';

import { BlockedUsersSection } from './BlockedUsersSection';

const blocks = vi.hoisted(() => ({ request: Promise.withResolvers<Author[]>() }));
vi.mock('@/features/user/api/user.api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchBlockedUsers: () => blocks.request.promise,
}));

describe('blocked users in settings', () => {
  // 차단 목록을 일반 useQuery로 받아 받는 중에도 "0명"을 보였다.
  it('does not report zero blocked users before the list arrives', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BlockedUsersSection userId="viewer" />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: '차단한 사용자' })).toBeTruthy();
    expect(screen.queryByText(/명$/)).toBeNull();
    expect(screen.queryByText('차단한 사용자가 없어요.')).toBeNull();

    await act(async () => blocks.request.resolve([]));
    expect(await screen.findByText('0명')).toBeTruthy();
    expect(screen.getByText('차단한 사용자가 없어요.')).toBeTruthy();
  });
});
