import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GroupRole,
  GroupVisibility,
  LeaveGroupDocument,
  MyGroupsDocument,
  type MyGroupsQuery,
} from '@/shared/api/generated';
import { toast } from '@/shared/model/toast';

import { LeaveGroupButton } from './LeaveGroupButton';

const card = (id: string, name: string): MyGroupsQuery['myGroups'][number] => ({
  __typename: 'Group',
  id,
  name,
  description: '',
  avatarUrl: null,
  role: GroupRole.Member,
  members: [],
});

beforeEach(() => {
  vi.spyOn(toast, 'success');
});

afterEach(() => {
  act(() => overlay.unmountAll());
  vi.restoreAllMocks();
});

describe('LeaveGroupButton', () => {
  it('확인한 뒤 그룹을 나가고 홈 그룹 목록에서 빼야 한다', async () => {
    const user = userEvent.setup();
    const cache = new InMemoryCache();
    cache.writeQuery({
      query: MyGroupsDocument,
      data: { myGroups: [card('group-1', '웃음 연구소'), card('group-2', '산책 모임')] },
    });
    const client = new ApolloClient({
      cache,
      link: new MockLink([
        {
          request: { query: LeaveGroupDocument, variables: { groupId: 'group-1' } },
          result: {
            data: {
              leaveGroup: {
                __typename: 'Group',
                id: 'group-1',
                name: '웃음 연구소',
                visibility: GroupVisibility.Private,
                role: null,
                memberCount: 2,
                canViewPosts: false,
                joinRequestPending: false,
                inviteToken: null,
                members: [],
              },
            },
          },
        },
      ]),
    });
    render(
      <ApolloProvider client={client}>
        <OverlayProvider>
          <LeaveGroupButton groupId="group-1" groupName="웃음 연구소" visibility={GroupVisibility.Private} />
        </OverlayProvider>
      </ApolloProvider>,
    );

    await user.click(screen.getByRole('button', { name: '그룹 나가기' }));
    const dialog = await screen.findByRole('alertdialog', { name: '웃음 연구소에서 나갈까요?' });
    expect(dialog).toHaveTextContent('다시 들어오려면 가입 승인을 받아야 해요.');
    await user.click(within(dialog).getByRole('button', { name: '그룹 나가기' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('그룹에서 나왔어요'));
    expect(cache.readQuery({ query: MyGroupsDocument })?.myGroups.map(({ id }) => id)).toEqual(['group-2']);
  });
});
