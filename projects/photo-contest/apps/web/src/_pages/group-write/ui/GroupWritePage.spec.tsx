import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { EMPTY, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GalleryDocument, GroupRole, GroupVisibility, PostKind } from '@/shared/api/generated';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { routeHistoryStore } from '@/shared/model/router';

import { GroupWritePage } from './GroupWritePage';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/groups/group-1/write',
  useRouter: () => router,
}));
vi.mock('@/shared/model/analytics', async (original) => ({
  ...(await original<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

const DISCARD_TITLE = '작성 중인 글을 버릴까요?';

const CREATED_LINK_POST = {
  __typename: 'GalleryPost',
  id: 'post-1',
  contestId: null,
  groupId: 'group-1',
  groupName: '웃음 연구소',
  title: '링크로 올린 순간',
  body: '',
  kind: PostKind.Link,
  mediaUrl: null,
  mediaWidth: null,
  mediaHeight: null,
  linkUrl: 'https://example.com/moment',
  createdAt: '2026-10-22T00:00:00.000Z',
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  canDelete: true,
  canModerate: false,
  canInteract: true,
  category: null,
  contest: null,
  author: { __typename: 'User', id: 'author-1', nickname: '작성자', avatar: null },
};

/** 그룹 글쓰기 화면. 앱 안 기록이 있어 뒤로 가기는 이전 화면으로 간다. */
async function renderWritePage() {
  const user = userEvent.setup();
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) =>
      operation.operationName === 'CreatePost' ? of({ data: { createPost: CREATED_LINK_POST } }) : EMPTY,
    ),
  });
  client.writeQuery({
    query: GalleryDocument,
    variables: { id: 'group-1' },
    data: {
      group: {
        __typename: 'Group',
        coverUrl: null,
        description: '',
        avatarUrl: null,
        name: '웃음 연구소',
        inviteToken: null,
        id: 'group-1',
        visibility: GroupVisibility.Public,
        role: GroupRole.Member,
        memberCount: 1,
        canViewPosts: true,
        joinRequestPending: false,
        members: [],
        categories: [],
      },
    },
  });
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <OverlayProvider>
          <GroupWritePage groupId="group-1" />
        </OverlayProvider>
      </ApolloProvider>,
    );
  });
  return {
    user,
    back: screen.getByRole('button', { name: '뒤로 가기' }),
    title: screen.getByLabelText('제목', { exact: false }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  routeHistoryStore.start('navigate');
  routeHistoryStore.record('/groups/group-1/write');
});

afterEach(() => act(() => overlay.unmountAll()));

describe('GroupWritePage 떠나기 전 확인', () => {
  it('입력을 바꾼 뒤 뒤로 가기를 누르면 버릴지 묻고, 계속 쓰면 화면과 초안을 지켜야 한다', async () => {
    const { user, back, title } = await renderWritePage();
    await user.type(title, '쓰던 글');

    await user.click(back);
    const dialog = await screen.findByRole('alertdialog', { name: DISCARD_TITLE });
    await user.click(within(dialog).getByRole('button', { name: '계속 쓰기' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(back).toHaveFocus());
    expect(title).toHaveValue('쓰던 글');
    expect(router.back).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('버리기를 고르면 Activity에 남을 초안을 비우고 이전 화면으로 돌아가야 한다', async () => {
    const { user, back, title } = await renderWritePage();
    await user.type(title, '버릴 글');

    await user.click(back);
    const dialog = await screen.findByRole('alertdialog', { name: DISCARD_TITLE });
    expect(router.back).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: '글 버리고 나가기' }));

    await waitFor(() => expect(router.back).toHaveBeenCalledOnce());
    expect(title).toHaveValue('');
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith(ANALYTICS_EVENT.PostDraftDiscarded, {
      group_id: 'group-1',
    });
  });

  it('입력하지 않았으면 묻지 않고 바로 이전 화면으로 가야 한다', async () => {
    const { user, back } = await renderWritePage();

    await user.click(back);

    expect(router.back).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('게시에 성공하면 묻지 않고 그룹으로 옮겨 가고, 그 뒤 뒤로 가기도 묻지 않아야 한다', async () => {
    const { user, back, title } = await renderWritePage();
    await user.type(title, '링크로 올린 순간');
    await user.type(screen.getByLabelText('첨부 링크', { exact: false }), 'https://example.com/moment');
    await user.click(screen.getByRole('checkbox', { name: /공유할 권리/ }));

    await user.click(screen.getByRole('button', { name: '게시물 올리기' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/groups/group-1', undefined));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.click(back);
    expect(router.back).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
