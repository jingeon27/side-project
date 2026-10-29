import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GroupRole, GroupVisibility, RemoveGroupMemberDocument } from '@/shared/api/generated';
import { toast } from '@/shared/model/toast';

import { MemberList } from './MemberList';

const member = (id: string, nickname: string, role: GroupRole) => ({
  __typename: 'Member' as const,
  role,
  user: { __typename: 'User' as const, id, nickname, avatar: null },
});
const MEMBERS = [
  member('owner', '그룹장', GroupRole.Owner),
  member('deputy', '부관리자', GroupRole.Moderator),
  member('friend', '친구', GroupRole.Member),
];

function renderList(viewerId: string, viewerRole: GroupRole, mocks: MockLink.MockedResponse[] = []) {
  const user = userEvent.setup();
  const client = new ApolloClient({ cache: new InMemoryCache(), link: new MockLink(mocks) });
  render(
    <ApolloProvider client={client}>
      <OverlayProvider>
        <MemberList groupId="group-1" members={MEMBERS} viewerId={viewerId} viewerRole={viewerRole} />
      </OverlayProvider>
    </ApolloProvider>,
  );
  return { user };
}

beforeEach(() => {
  vi.spyOn(toast, 'success');
});

afterEach(() => {
  act(() => overlay.unmountAll());
  vi.restoreAllMocks();
});

describe('MemberList 내보내기', () => {
  it('그룹장은 부관리자·멤버를, 부관리자는 일반 멤버만 내보낼 수 있어야 한다', () => {
    renderList('owner', GroupRole.Owner);
    expect(screen.getByRole('button', { name: '부관리자 내보내기' })).toBeVisible();
    expect(screen.getByRole('button', { name: '친구 내보내기' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '그룹장 내보내기' })).not.toBeInTheDocument();
  });

  it('부관리자에게는 일반 멤버의 내보내기만 보여야 한다', () => {
    renderList('deputy', GroupRole.Moderator);
    expect(screen.getByRole('button', { name: '친구 내보내기' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: /내보내기$/ })).toHaveLength(1);
  });

  it('일반 멤버에게는 내보내기를 보여 주지 않아야 한다', () => {
    renderList('friend', GroupRole.Member);
    expect(screen.getByText('친구')).toBeVisible();
    expect(screen.queryAllByRole('button', { name: /내보내기$/ })).toHaveLength(0);
  });

  it('확인 대화상자에서 내보내기를 누르면 서버에 요청하고 알려야 한다', async () => {
    const { user } = renderList('owner', GroupRole.Owner, [
      {
        request: { query: RemoveGroupMemberDocument, variables: { groupId: 'group-1', userId: 'friend' } },
        result: {
          data: {
            removeGroupMember: {
              __typename: 'Group',
              id: 'group-1',
              name: '웃음 연구소',
              visibility: GroupVisibility.Private,
              role: GroupRole.Owner,
              memberCount: 2,
              canViewPosts: true,
              joinRequestPending: false,
              members: MEMBERS.slice(0, 2),
            },
          },
        },
      },
    ]);

    await user.click(screen.getByRole('button', { name: '친구 내보내기' }));
    const dialog = await screen.findByRole('alertdialog', { name: '친구님을 그룹에서 내보낼까요?' });
    expect(dialog).toHaveTextContent('남긴 게시물과 댓글은 그대로 남아요.');
    await user.click(screen.getByRole('button', { name: '내보내기' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('멤버를 내보냈어요'));
  });
});
