import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createErrorToastLink } from '@/shared/api/apollo-link.helper';
import {
  GalleryPostCardFragmentDoc,
  GroupContestSummaryFragmentDoc,
  MeDocument,
  Phase,
  PostKind,
  type GalleryPostCardFragment,
  type GroupContestSummaryFragment,
  type MeQuery,
} from '@/shared/api/generated';
import { toast } from '@/shared/model/toast';

import { GroupContestVoteButton } from './GroupContestVoteButton';

const VIEWER: NonNullable<MeQuery['me']> = {
  __typename: 'User',
  id: 'viewer',
  nickname: '나',
  avatar: null,
  isAnonymous: false,
  needsOnboarding: false,
};

const contest = (overrides: Partial<GroupContestSummaryFragment> = {}): GroupContestSummaryFragment => ({
  __typename: 'GroupContest',
  id: 'contest-1',
  groupId: 'group-1',
  title: '가을 웃음 대회',
  likeLimit: 1,
  startsAt: '2026-10-01T00:00:00.000Z',
  submissionEndsAt: '2026-10-10T00:00:00.000Z',
  endsAt: '2026-10-15T00:00:00.000Z',
  phase: Phase.Voting,
  isAdmin: false,
  canParticipate: false,
  canVote: true,
  votedPostId: null,
  entryCount: 3,
  ...overrides,
});

const entry = (id: string, title: string, overrides: Partial<GalleryPostCardFragment> = {}) =>
  ({
    __typename: 'GalleryPost',
    id,
    contestId: 'contest-1',
    groupId: 'group-1',
    groupName: '웃음 연구소',
    title,
    body: '',
    kind: PostKind.Photo,
    mediaUrl: `/backend/media/${id}`,
    mediaWidth: null,
    mediaHeight: null,
    linkUrl: null,
    createdAt: '2026-10-05T00:00:00.000Z',
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    canDelete: false,
    canModerate: false,
    canInteract: true,
    category: null,
    contest: {
      __typename: 'PostContest',
      id: 'contest-1',
      groupId: 'group-1',
      title: '가을 웃음 대회',
      phase: Phase.Voting,
      likeLimit: 1,
    },
    author: { __typename: 'User', id: 'friend', nickname: '친구', avatar: null },
    ...overrides,
  }) satisfies GalleryPostCardFragment;

const ENTRIES = [
  entry('post-a', '점심의 순간'),
  entry('post-b', '퇴근길 노을'),
  entry('post-mine', '내 사진', {
    author: { __typename: 'User', id: 'viewer', nickname: '나', avatar: null },
  }),
];

interface IVoteRequest {
  variables: Record<string, unknown>;
  succeed: (voted: GroupContestSummaryFragment) => void;
  failNetwork: () => void;
}

/** 대회 상세의 참여작 목록처럼 같은 대회 캐시를 구독하는 투표 버튼들. 투표 응답은 테스트가 보낼 때까지 붙잡는다. */
function renderEntries({
  me = VIEWER,
  summary = contest(),
  entries = ENTRIES,
}: {
  me?: MeQuery['me'];
  summary?: GroupContestSummaryFragment;
  entries?: GalleryPostCardFragment[];
} = {}) {
  const user = userEvent.setup();
  const requests: IVoteRequest[] = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable((sink) => {
        requests.push({
          variables: operation.variables,
          succeed: (voted) => {
            sink.next({ data: { castGroupContestVote: voted } });
            sink.complete();
          },
          failNetwork: () => sink.error(new TypeError('Failed to fetch')),
        });
      }),
  );
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([createErrorToastLink((message) => toast.error(message)), link]),
  });
  client.writeQuery({ query: MeDocument, data: { me } });
  client.writeFragment({ fragment: GroupContestSummaryFragmentDoc, data: summary });
  for (const post of entries)
    client.writeFragment({
      fragment: GalleryPostCardFragmentDoc,
      fragmentName: 'GalleryPostCard',
      data: post,
    });
  render(
    <ApolloProvider client={client}>
      <ul>
        {entries.map((post) => (
          <li key={post.id} aria-label={post.title}>
            <GroupContestVoteButton contestId="contest-1" postId={post.id} />
          </li>
        ))}
      </ul>
    </ApolloProvider>,
  );
  const votedPostId = () =>
    client.readFragment({
      fragment: GroupContestSummaryFragmentDoc,
      id: client.cache.identify({ __typename: 'GroupContest', id: 'contest-1' }),
    })?.votedPostId;
  return { user, requests, votedPostId };
}

/** 버튼 이름은 참여작 제목이고 투표 상태는 버튼 글자로 보여 준다. */
const voteButton = (title: string) => screen.getByRole('button', { name: `${title} 대회 투표` });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(toast, 'success');
  vi.spyOn(toast, 'error');
});

describe('GroupContestVoteButton', () => {
  it('투표 중에는 잠가 다시 눌러도 한 번만 보내고, 투표하면 고른 참여작과 나머지 참여작의 상태를 바꿔야 한다', async () => {
    const { user, requests, votedPostId } = renderEntries();
    const lunch = voteButton('점심의 순간');
    expect(lunch).toHaveTextContent('이 참여작에 투표하기');
    expect(lunch).toBeEnabled();

    await user.click(lunch);
    await waitFor(() => expect(lunch).toHaveAttribute('aria-busy', 'true'));
    await user.click(lunch);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.variables).toEqual({ contestId: 'contest-1', postId: 'post-a' });
    expect(voteButton('퇴근길 노을')).toHaveTextContent('이 참여작에 투표하기');

    await act(async () => requests[0]!.succeed(contest({ votedPostId: 'post-a' })));

    await waitFor(() => expect(lunch).toHaveTextContent('내가 투표한 참여작'));
    expect(lunch).not.toHaveAttribute('aria-busy');
    expect(voteButton('퇴근길 노을')).toHaveTextContent('투표 완료');
    expect(votedPostId()).toBe('post-a');
    expect(toast.success).toHaveBeenCalledExactlyOnceWith('투표했어요. 종료 후 결과를 확인해 주세요.');
  });

  it('투표가 실패하면 투표 전 상태로 돌아가 다시 누를 수 있어야 한다', async () => {
    const { user, requests, votedPostId } = renderEntries();
    const lunch = voteButton('점심의 순간');
    await user.click(lunch);
    await waitFor(() => expect(requests).toHaveLength(1));

    await act(async () => requests[0]!.failNetwork());

    await waitFor(() => expect(lunch).not.toHaveAttribute('aria-busy'));
    expect(lunch).toBeEnabled();
    expect(lunch).toHaveTextContent('이 참여작에 투표하기');
    expect(voteButton('퇴근길 노을')).toHaveTextContent('이 참여작에 투표하기');
    expect(votedPostId()).toBeNull();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith('네트워크 연결을 확인하고 다시 시도해 주세요.');
    expect(toast.success).not.toHaveBeenCalled();

    await user.click(lunch);
    await waitFor(() => expect(requests).toHaveLength(2));
    await act(async () => requests[1]!.succeed(contest({ votedPostId: 'post-a' })));
    await waitFor(() => expect(lunch).toHaveTextContent('내가 투표한 참여작'));
  });

  it('내가 올린 참여작과 투표할 수 없는 대회의 참여작은 버튼을 잠가야 한다', () => {
    renderEntries({ summary: contest({ canVote: false }), entries: ENTRIES.slice(1) });
    expect(voteButton('내 사진')).toHaveTextContent('내가 올린 참여작');
    expect(voteButton('내 사진')).toBeDisabled();
    expect(voteButton('퇴근길 노을')).toHaveTextContent('이 참여작에 투표하기');
    expect(voteButton('퇴근길 노을')).toBeDisabled();
  });

  it.each([
    {
      viewer: '로그인하지 않은 사람',
      me: null,
      entries: [ENTRIES[0]!],
      link: '그룹 가입 후 투표하기',
      href: '/groups/group-1',
    },
    {
      viewer: '그룹 멤버가 아닌 사람',
      me: VIEWER,
      entries: [entry('post-a', '점심의 순간', { canInteract: false })],
      link: '그룹 가입 후 투표하기',
      href: '/groups/group-1',
    },
    {
      viewer: '익명 사용자',
      me: { ...VIEWER, isAnonymous: true },
      entries: [ENTRIES[0]!],
      link: '로그인하고 투표하기',
      href: '/sign?next=%2Fgroups%2Fgroup-1%2Fcontests%2Fcontest-1',
    },
  ])('$viewer에게는 투표 버튼 대신 "$link" 링크를 보여 줘야 한다', ({ me, entries, link, href }) => {
    renderEntries({ me, entries });
    expect(screen.getByRole('link', { name: link })).toHaveAttribute('href', href);
    expect(screen.queryByRole('button', { name: '점심의 순간 대회 투표' })).not.toBeInTheDocument();
  });
});
