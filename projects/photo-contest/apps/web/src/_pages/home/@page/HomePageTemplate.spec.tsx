import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { groupTypePolicies } from '@/features/group';
import { postTypePolicies } from '@/features/post';
import { GroupVisibility } from '@/shared/api/generated';

import { HomePageTemplate } from './HomePageTemplate';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => navigation,
}));
beforeEach(() => {
  navigation.replace.mockReset();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ developmentLogin: false, google: false, kakao: false })),
        ),
      ),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function openHome({ signedIn = true, hasGroup = false } = {}) {
  const state = { hasGroup };
  const group = {
    __typename: 'Group',
    id: 'public',
    name: '공개 웃음',
    visibility: GroupVisibility.Public,
    role: null,
    memberCount: 1,
    canViewPosts: true,
    joinRequestPending: false,
    members: [],
  };
  const operations: string[] = [];
  const client = new ApolloClient({
    cache: new InMemoryCache({
      typePolicies: {
        Query: { fields: { ...postTypePolicies.Query?.fields, ...groupTypePolicies.Query?.fields } },
      },
    }),
    link: new ApolloLink(
      (operation) =>
        new Observable((sink) => {
          operations.push(operation.operationName ?? '');
          let data: Record<string, unknown> = {};
          if (operation.operationName === 'Me')
            data = {
              me: signedIn ? { __typename: 'User', id: 'new', nickname: '신규', avatar: null } : null,
            };
          if (operation.operationName === 'MyGroups')
            data = { myGroups: state.hasGroup ? [{ ...group, role: 'MEMBER' }] : [] };
          if (operation.operationName === 'DiscoverGroups')
            data = { discoverGroups: [{ ...group, role: state.hasGroup ? 'MEMBER' : null }] };
          if (operation.operationName === 'PublicGalleryPosts') data = { publicGalleryPosts: [] };
          if (operation.operationName === 'GalleryPosts') data = { galleryPosts: [] };
          if (operation.operationName === 'RequestGroupMembership') {
            state.hasGroup = true;
            data = { requestGroupMembership: { ...group, role: 'MEMBER' } };
          }
          queueMicrotask(() => {
            sink.next({ data });
            sink.complete();
          });
        }),
    ),
  });
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <HomePageTemplate />
      </ApolloProvider>,
    );
  });
  return { operations };
}

describe('홈의 가입 그룹 분기', () => {
  it('비로그인 사용자에게 로그인과 공개 탐색을 함께 보여 줘야 한다', async () => {
    const { operations } = await openHome({ signedIn: false });
    expect(await screen.findByRole('link', { name: '로그인 없이 그룹 둘러보기' })).toHaveAttribute(
      'href',
      '/explore',
    );
    expect(await screen.findByRole('region', { name: '공개 그룹의 최신 사진' })).toBeInTheDocument();
    expect(operations).not.toContain('MyGroups');
  });
  it('가입 그룹이 없으면 공개 그룹을 추천하고 인기를 보여 주지 않아야 한다', async () => {
    await openHome();
    expect(await screen.findByRole('region', { name: '추천 공개 그룹' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '그룹 가입하기' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '이달의 인기' })).not.toBeInTheDocument();
  });
  it('그룹은 있지만 게시물이 없으면 내 피드와 글쓰기 동작을 보여 줘야 한다', async () => {
    await openHome({ hasGroup: true });
    expect(await screen.findByRole('region', { name: '최신 게시물' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '글쓰기' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '추천 공개 그룹' })).not.toBeInTheDocument();
  });
  it('공개 그룹 가입 성공 후 추천 홈에서 내 그룹 피드로 즉시 바뀌어야 한다', async () => {
    await openHome();
    await userEvent.click(await screen.findByRole('button', { name: '그룹 가입하기' }));
    expect(await screen.findByRole('region', { name: '최신 게시물' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: '추천 공개 그룹' })).not.toBeInTheDocument(),
    );
  });
  it('검색어를 입력하면 탐색 URL로 이동해야 한다', async () => {
    await openHome();
    const user = userEvent.setup();
    await user.type(await screen.findByRole('textbox', { name: '그룹 검색' }), '상자 복어');
    await user.click(screen.getByRole('button', { name: '검색' }));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        '/explore?q=%EC%83%81%EC%9E%90+%EB%B3%B5%EC%96%B4',
        undefined,
      ),
    );
  });
});
