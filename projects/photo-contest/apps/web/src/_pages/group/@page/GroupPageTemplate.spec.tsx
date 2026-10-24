import { within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GalleryDocument, GroupRole, GroupVisibility } from '@/shared/api/generated';

import {
  createBrowserClient,
  createServerClient,
  hydrateOnClient,
  renderOnServer,
} from '../../../../test/support/ssr-hydration';
import { GroupPageTemplate } from './GroupPageTemplate';

vi.mock('next/navigation', () => ({
  usePathname: () => '/groups/group-1',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const owner = {
  __typename: 'User' as const,
  id: 'owner',
  nickname: '그룹장',
  avatar: null,
  needsOnboarding: false,
  isAnonymous: false,
};

function respond(name: string) {
  if (name === 'GalleryPosts') return { galleryPosts: [] };
  if (name === 'GroupCategories')
    return { group: { __typename: 'Group', id: 'group-1', role: GroupRole.Owner, categories: [] } };
  if (name === 'HiddenGalleryPosts') return { hiddenGalleryPosts: [] };
  if (name === 'GroupJoinRequests') return { groupJoinRequests: [] };
  return {};
}

describe('비공개 그룹 화면 SSR·hydration', () => {
  it('관리 섹션과 피드 틀은 서버 HTML에 두고, 사전 조회하지 않은 목록은 hydration 뒤 브라우저에서 받아야 한다', async () => {
    // 라우트는 비공개 그룹의 GalleryDocument만 사전 조회한다.
    const server = createServerClient((cache) =>
      cache.writeQuery({
        query: GalleryDocument,
        variables: { id: 'group-1' },
        data: {
          group: {
            __typename: 'Group',
            description: '',
            avatarUrl: null,
            id: 'group-1',
            name: '비공개 웃음',
            visibility: GroupVisibility.Private,
            role: GroupRole.Owner,
            memberCount: 1,
            canViewPosts: true,
            joinRequestPending: false,
            inviteToken: 'invite-token',
            members: [{ __typename: 'Member', role: GroupRole.Owner, user: owner }],
            categories: [],
          },
        },
      }),
    );
    const { html, errors } = await renderOnServer(server, <GroupPageTemplate id="group-1" />);
    expect(errors).toEqual([]);
    for (const text of ['최신 게시물', '카테고리 관리', '숨긴 게시물 관리', '가입 신청 관리'])
      expect(html).toContain(text);
    expect(html).not.toContain('대기 중인 가입 신청이 없어요.');

    const browser = createBrowserClient(server, respond);
    const view = await hydrateOnClient(html, browser.client, <GroupPageTemplate id="group-1" />);
    try {
      expect(await within(view.container).findByText('대기 중인 가입 신청이 없어요.')).toBeVisible();
      expect(await within(view.container).findByText('첫 사진을 올려보세요')).toBeVisible();
      // 카테고리 관리는 브라우저에서 시작하지만 GalleryDocument가 이미 정규화한 Group으로 채워져 요청하지 않는다.
      expect([...browser.operations].sort()).toEqual([
        'GalleryPosts',
        'GalleryPosts',
        'GroupJoinRequests',
        'HiddenGalleryPosts',
      ]);
      expect(view.recoverableErrors).toEqual([]);
    } finally {
      view.unmount();
    }
  });
});
