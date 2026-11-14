import { ApolloProvider, useBackgroundQuery } from '@apollo/client/react';
import { act, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { GalleryDocument, GroupRole, GroupVisibility } from '@/shared/api/generated';

import { createBrowserClient, createServerClient } from '../../../../test/support/ssr-hydration';
import { GroupSidebar } from './GroupSidebar';

const owner = {
  __typename: 'User' as const,
  id: 'owner',
  nickname: '그룹장',
  avatar: null,
  needsOnboarding: false,
  isAnonymous: false,
};

const group = {
  __typename: 'Group' as const,
  id: 'group-1',
  name: '웃음 연구소',
  description: '',
  avatarUrl: null,
  coverUrl: null,
  visibility: GroupVisibility.Public,
  role: GroupRole.Owner,
  memberCount: 1,
  canViewPosts: true,
  joinRequestPending: false,
  inviteToken: 'invite-token',
  members: [{ __typename: 'Member' as const, role: GroupRole.Owner, user: owner }],
  categories: [],
};

function respond(name: string) {
  if (name === 'GroupCategories')
    return { group: { __typename: 'Group', id: group.id, role: GroupRole.Owner, categories: [] } };
  if (name === 'HiddenGalleryPosts')
    return { hiddenGalleryPostsPage: { __typename: 'HiddenGalleryPostPage', items: [], nextOffset: null } };
  return {};
}

function Sidebar({ communityRef }: { communityRef: (details: HTMLDetailsElement | null) => void }) {
  const [groupRef] = useBackgroundQuery(GalleryDocument, { variables: { id: group.id } });
  return <GroupSidebar groupRef={groupRef} communityRef={communityRef} />;
}

// 초대와 관리 펼침 요소가 브라우저 기본 ▶ 표시를 그대로 보였다(V18).
it('초대와 관리 펼침 요소는 공통 Disclosure로 접힌 채 시작하고 초대 영역 details를 앱에 넘겨야 한다', async () => {
  const server = createServerClient((cache) =>
    cache.writeQuery({ query: GalleryDocument, variables: { id: group.id }, data: { group } }),
  );
  const { client } = createBrowserClient(server, respond);
  const communities: HTMLDetailsElement[] = [];
  const handleCommunityRef = (details: HTMLDetailsElement | null) => {
    if (details) communities.push(details);
  };
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <Sidebar communityRef={handleCommunityRef} />
      </ApolloProvider>,
    );
  });
  // 접힌 관리 목록도 브라우저에서 받아 그려 둔다. 다 받은 뒤 확인한다.
  expect(await screen.findByText('숨긴 게시물이 없어요.')).not.toBeVisible();
  expect(await screen.findByText(/^카테고리 0\/20개/)).not.toBeVisible();

  // 모바일·웹 e2e가 '초대와 그룹 멤버'를 정확히 일치로 찾는다.
  const [community, categories, hiddenPosts] = ['초대와 그룹 멤버', '카테고리 관리', '숨긴 게시물 관리'].map(
    (label) => screen.getByText(label).closest('summary'),
  );
  for (const trigger of [community, categories, hiddenPosts]) {
    expect(trigger).toHaveAttribute('data-slot', 'disclosure-trigger');
    expect(trigger?.parentElement).not.toHaveAttribute('open');
  }

  // 그룹 소개의 '초대와 멤버 보기'처럼 넘겨받은 details를 열고 summary로 포커스를 옮긴다.
  const details = communities.at(-1);
  expect(details).toBe(community?.parentElement);
  act(() => {
    if (details) details.open = true;
    details?.querySelector('summary')?.focus();
  });
  expect(community).toHaveFocus();
  expect(screen.getByRole('textbox', { name: '그룹 초대 링크' })).toBeVisible();
});
