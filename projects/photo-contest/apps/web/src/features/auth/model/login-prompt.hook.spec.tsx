import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, expect, it, vi } from 'vitest';

import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';

import { useLoginPrompt } from './login-prompt.hook';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/shared/model/analytics', async (original) => ({
  ...(await original<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

afterEach(() => {
  act(() => overlay.unmountAll());
  vi.clearAllMocks();
});

function PromptButton() {
  const promptLogin = useLoginPrompt();
  return <button onClick={() => promptLogin('/groups/group-1')}>열기</button>;
}

it('안내를 확인하면 인증 화면으로 이동하고 취소하면 기록하지 않아야 한다', async () => {
  window.history.replaceState(null, '', '/explore?q=비밀');
  const user = userEvent.setup();
  render(
    <OverlayProvider>
      <PromptButton />
    </OverlayProvider>,
  );
  await user.click(screen.getByRole('button', { name: '열기' }));
  await user.click(await screen.findByRole('button', { name: '취소' }));
  expect(trackEvent).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '열기' }));
  await user.click(await screen.findByRole('button', { name: '로그인하기' }));
  expect(trackEvent).toHaveBeenCalledExactlyOnceWith(ANALYTICS_EVENT.SignEntryClicked, {
    placement: 'login_prompt',
    source_path_template: '/explore',
    destination_path_template: '/groups/:id',
  });
  // 안내가 쌓은 history 항목 위에서 이동하므로 앱 router가 push를 replace로 바꾼다.
  expect(router.replace).toHaveBeenCalledWith('/sign?next=%2Fgroups%2Fgroup-1', undefined);
});
