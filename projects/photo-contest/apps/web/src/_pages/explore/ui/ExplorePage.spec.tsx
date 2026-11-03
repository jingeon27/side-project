import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DiscoverGroupsDocument,
  GroupRole,
  GroupVisibility,
  MeDocument,
  MyGroupsDocument,
  type DiscoverGroupsQuery,
  type MyGroupsQuery,
} from '@/shared/api/generated';
import { trackEvent } from '@/shared/model/analytics';

import { ExplorePage } from './ExplorePage';

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/explore',
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => navigation,
}));
vi.mock('@/shared/model/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

beforeEach(() => {
  window.history.replaceState(null, '', '/explore?q=산책');
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.prefetch.mockReset();
  vi.mocked(trackEvent).mockClear();
});

afterEach(() => {
  act(() => overlay.unmountAll());
});

const GROUP = {
  __typename: 'Group',
  id: 'joined-group',
  name: '우리 웃음',
  description: '',
  avatarUrl: null,
  role: GroupRole.Member,
  memberCount: 2,
} satisfies MyGroupsQuery['myGroups'][number];

const DISCOVERED = {
  __typename: 'Group',
  id: 'walk-group',
  name: '산책 모임',
  description: '',
  avatarUrl: null,
  visibility: GroupVisibility.Public,
  role: null,
  memberCount: 3,
  joinRequestPending: false,
  canViewPosts: true,
} satisfies DiscoverGroupsQuery['discoverGroups'][number];

function renderExplore({
  hasGroups = false,
  signedIn = true,
  discovered = [] as DiscoverGroupsQuery['discoverGroups'],
} = {}) {
  const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
  client.writeQuery({
    query: MeDocument,
    data: {
      me: signedIn
        ? {
            __typename: 'User',
            id: 'viewer',
            nickname: '웃음 친구',
            avatar: null,
            needsOnboarding: false,
            isAnonymous: false,
          }
        : null,
    },
  });
  client.writeQuery({ query: MyGroupsDocument, data: { myGroups: hasGroups ? [GROUP] : [] } });
  client.writeQuery({
    query: DiscoverGroupsDocument,
    variables: { search: '산책', offset: 0, limit: 24 },
    data: { discoverGroups: discovered },
  });
  render(
    <ApolloProvider client={client}>
      <OverlayProvider>
        <main id="pc-main">
          <ExplorePage search="산책" />
        </main>
      </OverlayProvider>
    </ApolloProvider>,
  );
  return { client, user: userEvent.setup() };
}

describe('그룹 탐색의 공통 작성 진입', () => {
  it('참여 그룹이 없으면 헤더에 중복 행동 없이 고정 그룹 만들기 버튼으로 바로 이동해야 한다', async () => {
    const { user } = renderExplore();
    const create = await screen.findByRole('button', { name: '그룹 만들기' });
    expect(create).toHaveAttribute('data-compose-entry');
    expect(screen.getAllByRole('button', { name: '그룹 만들기' })).toHaveLength(1);
    const heading = screen.getByRole('heading', { name: '그룹 탐색' });
    expect(heading.closest('header')).not.toContainElement(create);
    expect(screen.getByRole('textbox', { name: '그룹 검색' })).toHaveValue('산책');
    expect(screen.getByRole('heading', { name: '검색 결과' })).toBeVisible();
    expect(screen.getByText('“산책”')).toBeVisible();
    await user.click(create);
    expect(navigation.prefetch).toHaveBeenCalledWith('/groups/new');
    expect(navigation.push).toHaveBeenCalledWith('/groups/new', undefined);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('참여 그룹이 있으면 같은 글쓰기 시트에서 게시글 작성 선택 즉시 해당 그룹으로 이동해야 한다', async () => {
    const { user } = renderExplore({ hasGroups: true });
    await user.click(await screen.findByRole('button', { name: '글쓰기' }));
    const sheet = await screen.findByRole('dialog', { name: '글쓰기' });
    expect(within(sheet).getByRole('button', { name: '그룹 만들기' })).toBeVisible();
    await user.click(within(sheet).getByRole('button', { name: '게시글 작성' }));
    expect(navigation.replace).toHaveBeenCalledWith('/groups/joined-group/write', undefined);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('그룹 가입이 Apollo 캐시에 반영되면 검색 화면을 유지하며 고정 버튼이 글쓰기로 바뀌어야 한다', async () => {
    const { client } = renderExplore();
    await screen.findByRole('button', { name: '그룹 만들기' });
    await act(async () => {
      client.writeQuery({ query: MyGroupsDocument, data: { myGroups: [GROUP] } });
    });
    expect(await screen.findByRole('button', { name: '글쓰기' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '그룹 만들기' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '그룹 검색' })).toHaveValue('산책');
  });

  it('세션이 없는 상태에는 작성 행동을 표시하지 않아야 한다', async () => {
    renderExplore({ signedIn: false });
    await screen.findByRole('heading', { name: '검색 결과' });
    expect(screen.queryByRole('button', { name: '글쓰기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '그룹 만들기' })).not.toBeInTheDocument();
  });

  it('빈 검색 결과에서 전체 그룹으로 복구할 때 검색어만 지우고 다른 URL 상태를 유지해야 한다', async () => {
    window.history.replaceState(null, '', '/explore?q=산책&tag=a&tag=b#results');
    const { user } = renderExplore();
    await user.click(await screen.findByRole('button', { name: '전체 그룹 보기' }));
    expect(navigation.replace).toHaveBeenCalledWith('/explore?tag=a&tag=b#results', undefined);
    expect(trackEvent).toHaveBeenCalledOnce();
    expect(trackEvent).toHaveBeenCalledWith('group_search_cleared', { placement: 'empty_state' });
  });

  it('검색 결과가 있으면 결과 수를 알리고 검색 초기화로 검색어만 지워야 한다', async () => {
    window.history.replaceState(null, '', '/explore?q=산책&tag=a#results');
    const { user } = renderExplore({ discovered: [DISCOVERED] });
    const card = await screen.findByRole('link', { name: '산책 모임' });
    expect(card).toHaveAccessibleDescription('공개 그룹. 멤버 3명. 둘러보기.');
    expect(screen.getByRole('status')).toHaveTextContent('그룹 1개를 표시하고 있어요.');
    await user.click(screen.getByRole('button', { name: '검색 초기화' }));
    expect(navigation.replace).toHaveBeenCalledWith('/explore?tag=a#results', undefined);
    expect(trackEvent).toHaveBeenCalledOnce();
    expect(trackEvent).toHaveBeenCalledWith('group_search_cleared', { placement: 'results_header' });
  });
});
