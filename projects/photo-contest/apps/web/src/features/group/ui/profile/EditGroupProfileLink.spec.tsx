import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GroupAccessFragmentDoc, GroupRole, GroupVisibility } from '@/shared/api/generated';

import { EditGroupProfileLink } from './EditGroupProfileLink';

describe('그룹 프로필 수정 진입 권한', () => {
  it.each([GroupRole.Owner, GroupRole.Moderator, GroupRole.Member, null])(
    '%s 역할에 맞게 수정 페이지 링크를 표시해야 한다',
    (role) => {
      const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
      client.cache.writeFragment({
        id: 'Group:group-1',
        fragment: GroupAccessFragmentDoc,
        data: {
          __typename: 'Group',
          id: 'group-1',
          role,
          visibility: GroupVisibility.Public,
          memberCount: 2,
          canViewPosts: true,
          joinRequestPending: false,
        },
      });
      render(
        <ApolloProvider client={client}>
          <EditGroupProfileLink groupId="group-1" />
        </ApolloProvider>,
      );
      if (role === GroupRole.Owner || role === GroupRole.Moderator) {
        expect(screen.getByRole('link', { name: '그룹 프로필 수정' })).toHaveAttribute(
          'href',
          '/groups/group-1/edit',
        );
        return;
      }
      expect(screen.queryByRole('link', { name: '그룹 프로필 수정' })).not.toBeInTheDocument();
    },
  );
});
