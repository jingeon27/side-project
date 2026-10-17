import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { installFakeNativeApp } from '@photo-contest/bridge/test';
import type { IFakeNativeApp } from '@photo-contest/bridge/test';
import { createWebBridge } from '@photo-contest/bridge/web';
import type { IWebBridge } from '@photo-contest/bridge/web';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { OverlayProvider, overlay } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RegenerateInviteLinkDocument } from '@/shared/api/generated';
import { trackEvent } from '@/shared/model/analytics';
import { BridgeContext } from '@/shared/model/bridge';
import { toast } from '@/shared/model/toast';

import { InviteCard } from './InviteCard';

vi.mock('@/shared/model/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

const INVITE_URL = `${window.location.origin}/invite/token-1`;

let fake: IFakeNativeApp | null;

/** 브라우저 공유·복사 기능을 테스트마다 정한다. 없는 기능은 undefined로 둔다. */
function stubBrowser({
  share,
  writeText,
  execCommand = () => false,
}: {
  share?: (data: ShareData) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
  execCommand?: () => boolean;
}) {
  Object.defineProperty(window.navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(window.navigator, 'canShare', { value: undefined, configurable: true });
  Object.defineProperty(window.navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
  Object.defineProperty(document, 'execCommand', { value: vi.fn(execCommand), configurable: true });
}

function renderCard({
  bridge = null,
  canRegenerate = false,
  mocks = [],
}: {
  bridge?: IWebBridge | null;
  canRegenerate?: boolean;
  mocks?: MockLink.MockedResponse[];
} = {}) {
  const user = userEvent.setup();
  const client = new ApolloClient({ cache: new InMemoryCache(), link: new MockLink(mocks) });
  render(
    <ApolloProvider client={client}>
      <BridgeContext value={bridge}>
        <OverlayProvider>
          <InviteCard
            groupId="group-1"
            groupName="웃음 연구소"
            inviteToken="token-1"
            canRegenerate={canRegenerate}
          />
        </OverlayProvider>
      </BridgeContext>
    </ApolloProvider>,
  );
  return { user };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake = null;
  vi.spyOn(toast, 'success');
  vi.spyOn(toast, 'error');
});

afterEach(() => {
  fake?.uninstall();
  act(() => overlay.unmountAll());
});

describe('InviteCard', () => {
  it('읽기 전용 입력에 절대 초대 주소를 보여 줘야 한다', () => {
    renderCard();
    expect(screen.getByRole('textbox', { name: '그룹 초대 링크' })).toHaveValue(INVITE_URL);
    expect(screen.getByRole('textbox', { name: '그룹 초대 링크' })).toHaveAttribute('readonly');
  });

  it('앱 안에서는 앱 공유 시트로 초대 주소를 보내야 한다', async () => {
    fake = installFakeNativeApp(window, { capabilities: { 'share.open': async () => ({ shared: true }) } });
    const { user } = renderCard({ bridge: createWebBridge(window) });

    await user.click(screen.getByRole('button', { name: '친구 초대하기' }));

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith('invite_link_shared', {
        group_id: 'group-1',
        method: 'native',
      }),
    );
    expect(fake.calls).toEqual([
      {
        type: 'share.open',
        payload: expect.objectContaining({ url: INVITE_URL, text: expect.stringContaining('웃음 연구소') }),
      },
    ]);
  });

  it('앱 안에서는 앱 클립보드로 복사하고 안내해야 한다', async () => {
    fake = installFakeNativeApp(window, {
      capabilities: { 'clipboard.copy': async () => ({ copied: true }) },
    });
    const { user } = renderCard({ bridge: createWebBridge(window) });

    await user.click(screen.getByRole('button', { name: '링크 복사' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('초대 링크를 복사했어요'));
    expect(fake.calls).toEqual([{ type: 'clipboard.copy', payload: { text: INVITE_URL } }]);
    expect(trackEvent).toHaveBeenCalledWith('invite_link_copied', { group_id: 'group-1', method: 'native' });
  });

  it('브라우저에 Web Share가 있으면 그것으로 공유해야 한다', async () => {
    const { user } = renderCard();
    const share = vi.fn(async () => undefined);
    stubBrowser({ share });

    await user.click(screen.getByRole('button', { name: '친구 초대하기' }));

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith('invite_link_shared', {
        group_id: 'group-1',
        method: 'web_share',
      }),
    );
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: INVITE_URL }));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('공유할 수 없으면 복사로 대신하고 안내해야 한다', async () => {
    const { user } = renderCard();
    const writeText = vi.fn(async () => undefined);
    stubBrowser({ writeText });

    await user.click(screen.getByRole('button', { name: '친구 초대하기' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('초대 링크를 복사했어요'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(INVITE_URL));
    expect(trackEvent).toHaveBeenCalledWith('invite_link_shared', {
      group_id: 'group-1',
      method: 'clipboard',
    });
  });

  it('클립보드 API가 없으면 숨긴 입력 선택 복사로 대신해야 한다', async () => {
    const { user } = renderCard();
    stubBrowser({ execCommand: () => true });

    await user.click(screen.getByRole('button', { name: '링크 복사' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('초대 링크를 복사했어요'));
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(trackEvent).toHaveBeenCalledWith('invite_link_copied', {
      group_id: 'group-1',
      method: 'clipboard',
    });
  });

  it('복사할 방법이 없으면 직접 복사하라고 안내하고 이벤트를 보내지 않아야 한다', async () => {
    const { user } = renderCard();
    stubBrowser({ writeText: async () => Promise.reject(new Error('denied')) });

    await user.click(screen.getByRole('button', { name: '링크 복사' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('공유 시트를 닫으면 아무것도 안내하지 않아야 한다', async () => {
    const { user } = renderCard();
    stubBrowser({ share: async () => Promise.reject(new DOMException('닫음', 'AbortError')) });

    await user.click(screen.getByRole('button', { name: '친구 초대하기' }));

    await waitFor(() => expect(document.execCommand).not.toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('관리자가 아니면 링크를 새로 만들 수 없어야 한다', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: '링크 새로 만들기' })).not.toBeInTheDocument();
  });

  it('관리자는 확인을 거쳐 링크를 새로 만들어야 한다', async () => {
    const { user } = renderCard({
      canRegenerate: true,
      mocks: [
        {
          request: { query: RegenerateInviteLinkDocument, variables: { groupId: 'group-1' } },
          result: {
            data: { regenerateInviteLink: { __typename: 'Group', id: 'group-1', inviteToken: 'token-2' } },
          },
        },
      ],
    });

    await user.click(screen.getByRole('button', { name: '링크 새로 만들기' }));
    const dialog = await screen.findByRole('alertdialog', { name: '초대 링크를 새로 만들까요?' });
    expect(dialog).toHaveTextContent('지금 링크는 더 이상 쓸 수 없어요.');
    await user.click(screen.getByRole('button', { name: '새 링크 만들기' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('새 초대 링크를 만들었어요', {
        description: '이전 링크로는 더 이상 가입할 수 없어요.',
      }),
    );
    expect(trackEvent).toHaveBeenCalledWith('invite_link_regenerated', { group_id: 'group-1' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
});
