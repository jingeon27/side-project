import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { GraphQLError } from 'graphql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GalleryDocument, GroupVisibility, type GalleryQuery } from '@/shared/api/generated';

import { GroupContentFrame } from './GroupContentFrame';

const PATH = '/groups/group-1/contests';

vi.mock('next/navigation', () => ({
  usePathname: () => PATH,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const GROUP: GalleryQuery['group'] = {
  __typename: 'Group',
  id: 'group-1',
  name: '웃음 모임',
  description: '',
  avatarUrl: null,
  coverUrl: null,
  inviteToken: null,
  visibility: GroupVisibility.Public,
  role: null,
  memberCount: 1,
  canViewPosts: true,
  joinRequestPending: false,
  members: [],
  categories: [],
};

const request = { query: GalleryDocument, variables: { id: GROUP.id } };
const failure = (code: string, message: string): MockLink.MockedResponse => ({
  request,
  result: { errors: [new GraphQLError(message, { extensions: { code } })] },
  delay: 0,
});

async function renderFrame(mocks: MockLink.MockedResponse[]) {
  const client = new ApolloClient({ cache: new InMemoryCache(), link: new MockLink(mocks) });
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <GroupContentFrame groupId={GROUP.id} title="그룹 대회">
          <p>대회 목록</p>
        </GroupContentFrame>
      </ApolloProvider>,
    );
  });
}

beforeEach(() => {
  // 로그인 패널이 소셜 로그인 설정을 읽는다.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ google: false, kakao: false }), { status: 200 })),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('GroupContentFrame', () => {
  it('그룹을 못 불러오면 빈 화면 대신 이유와 재시도를 보여 주고 다시 받으면 내용을 그려야 한다', async () => {
    const user = userEvent.setup();
    await renderFrame([
      failure('NOT_FOUND', '그룹을 찾을 수 없습니다.'),
      { request, result: { data: { group: GROUP } }, delay: 0 },
    ]);

    expect(await screen.findByText('그룹을 찾을 수 없습니다.')).toBeVisible();
    expect(screen.queryByText('대회 목록')).not.toBeInTheDocument();

    await act(() => user.click(screen.getByRole('button', { name: '다시 시도' })));

    expect(await screen.findByText('대회 목록')).toBeVisible();
  });

  it('세션이 만료됐으면 이 화면으로 돌아오는 로그인 패널을 보여 줘야 한다', async () => {
    await renderFrame([failure('UNAUTHENTICATED', '로그인이 필요합니다.')]);

    expect(await screen.findByRole('region', { name: '함께 웃는 순간을 나눠요' })).toBeVisible();
    expect(screen.queryByText('대회 목록')).not.toBeInTheDocument();
  });
});
