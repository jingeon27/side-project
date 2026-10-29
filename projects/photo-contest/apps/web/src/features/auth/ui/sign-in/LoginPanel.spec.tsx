import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IWebBridge } from '@photo-contest/bridge/web';

import { StartAnonymousSessionDocument } from '@/shared/api/generated';
import { navigateDocument } from '@/shared/lib/document-navigation.helper';
import { BridgeContext } from '@/shared/model/bridge';

import { LoginPanel } from './LoginPanel';

const navigation = vi.hoisted(() => ({ search: '' }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock('@/shared/lib/document-navigation.helper', () => ({ navigateDocument: vi.fn() }));
vi.mock('@/shared/model/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
  flushAnalytics: vi.fn(async () => undefined),
}));

function renderPanel({
  bridge = null,
  nextPath,
  allowAnonymous,
}: { bridge?: IWebBridge | null; nextPath?: string; allowAnonymous?: boolean } = {}) {
  const user = userEvent.setup();
  render(
    <MockedProvider
      mocks={[
        {
          request: { query: StartAnonymousSessionDocument },
          result: {
            data: {
              startAnonymousSession: {
                __typename: 'User',
                id: 'anonymous-1',
                nickname: '익명',
                avatar: null,
                isAnonymous: true,
                needsOnboarding: false,
              },
            },
          },
        },
      ]}
    >
      <BridgeContext value={bridge}>
        <LoginPanel nextPath={nextPath} allowAnonymous={allowAnonymous} />
      </BridgeContext>
    </MockedProvider>,
  );
  return { user };
}

beforeEach(() => {
  vi.clearAllMocks();
  navigation.search = '';
});

describe('LoginPanel', () => {
  it('기록 유지 안내의 회원가입 링크는 회원가입 탭을 바로 열어야 한다', async () => {
    navigation.search = '?mode=register&next=%2Fme';
    renderPanel();
    expect(await screen.findByRole('tab', { name: '회원가입', selected: true })).toBeVisible();
    expect(screen.getByRole('button', { name: '가입하고 시작하기' })).toBeVisible();
  });
  it('닉네임 입력 없이 익명 세션을 시작하고 화면이 넘긴 경로로 돌아가야 한다', async () => {
    const { user } = renderPanel({ nextPath: '/invite/token-1' });
    await user.click(screen.getByRole('button', { name: '익명으로 시작하기' }));
    await waitFor(() => expect(navigateDocument).toHaveBeenCalledWith('/invite/token-1'));
    expect(screen.queryByText('로컬 체험용 로그인')).not.toBeInTheDocument();
  });

  it('비공개 그룹의 로그인 화면은 익명 시작을 제공하지 않아야 한다', async () => {
    renderPanel({ allowAnonymous: false });
    expect(await screen.findByRole('button', { name: '아이디로 로그인' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '익명으로 시작하기' })).not.toBeInTheDocument();
  });

  it('다른 origin으로 새는 next는 무시하고 홈으로 돌아가야 한다', async () => {
    navigation.search = '?next=%2F%2Fevil.example%2Fsteal';
    const { user } = renderPanel();

    await user.click(screen.getByRole('button', { name: '익명으로 시작하기' }));

    await waitFor(() => expect(navigateDocument).toHaveBeenCalledWith('/'));
  });
});
