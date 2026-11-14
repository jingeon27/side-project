import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GroupAccessFragmentDoc, GroupRole, GroupVisibility } from '@/shared/api/generated';
import { Button } from '@/shared/ui/@core/button';

import { EditGroupProfileLink } from './EditGroupProfileLink';

function renderLink(role: GroupRole | null) {
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
}

describe('그룹 프로필 수정 진입 권한', () => {
  it.each([GroupRole.Owner, GroupRole.Moderator, GroupRole.Member, null])(
    '%s 역할에 맞게 수정 페이지 링크를 표시해야 한다',
    (role) => {
      renderLink(role);
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

describe('EditGroupProfileLink', () => {
  // 그룹 머리의 행동(가입, 초대와 멤버 보기, 프로필 수정)은 버튼 기본 모서리로 맞춘다.
  it('그룹 머리의 다른 행동 버튼과 같은 기본 모서리여야 한다', () => {
    renderLink(GroupRole.Owner);
    render(
      <Button variant="secondary" size="md">
        초대와 멤버 보기
      </Button>,
    );
    const radius = (element: Element) => [...element.classList].filter((name) => name.startsWith('rounded'));
    expect(radius(screen.getByRole('link', { name: '그룹 프로필 수정' }))).toEqual(
      radius(screen.getByRole('button', { name: '초대와 멤버 보기' })),
    );
  });
});
