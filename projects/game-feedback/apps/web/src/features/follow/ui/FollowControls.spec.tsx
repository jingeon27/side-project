import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FollowControls } from './FollowControls';

const api = vi.hoisted(() => ({ fetchFollowStatus: vi.fn() }));
vi.mock('../api/follow.api', () => ({ fetchFollowStatus: api.fetchFollowStatus, updateFollow: vi.fn() }));

function renderControls() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FollowControls userId="author" viewerId="viewer" onLogin={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.fetchFollowStatus.mockReset();
});

describe('follow controls', () => {
  it('shows the loading state until the follow status arrives', async () => {
    const status = Promise.withResolvers<{ following: boolean; notifyNewPosts: boolean }>();
    api.fetchFollowStatus.mockReturnValue(status.promise);
    renderControls();
    expect(screen.getByText('불러오고 있어요')).toBeTruthy();

    status.resolve({ following: true, notifyNewPosts: false });
    const toggle = await screen.findByRole('button', { name: '팔로잉' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '새 글 알림 꺼짐' })).toBeTruthy();
    expect(screen.queryByText('불러오고 있어요')).toBeNull();
    expect(api.fetchFollowStatus.mock.calls[0]?.[0]).toBe('author');
  });

  it('hands a failed status request to the follow boundary', async () => {
    api.fetchFollowStatus.mockRejectedValue(new Error('unavailable'));
    renderControls();
    expect(await screen.findByRole('alert', { name: '팔로우 설정 오류' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /팔로/ })).toBeNull();
  });
});
