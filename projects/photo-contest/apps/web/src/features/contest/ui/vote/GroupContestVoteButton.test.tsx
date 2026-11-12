import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  GalleryPostCardFragmentDoc,
  GroupContestSummaryFragmentDoc,
  MeDocument,
  Phase,
  PostKind,
  type GalleryPostCardFragment,
  type GroupContestSummaryFragment,
} from '@/shared/api/generated';

import { GroupContestVoteButton } from './GroupContestVoteButton';

const CONTEST: GroupContestSummaryFragment = {
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
};

const entry = (id: string, title: string, authorId = 'friend'): GalleryPostCardFragment => ({
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
  author: { __typename: 'User', id: authorId, nickname: authorId, avatar: null },
});

/** 대회 상세처럼 참여작마다 투표 버튼을 그린다. 투표는 바로 성공하고 API처럼 더 투표할 수 없게 답한다. */
function renderVoteButtons() {
  const user = userEvent.setup();
  const votes: unknown[] = [];
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(
      (operation) =>
        new Observable((sink) => {
          votes.push(operation.variables);
          sink.next({
            data: {
              castGroupContestVote: { ...CONTEST, canVote: false, votedPostId: operation.variables.postId },
            },
          });
          sink.complete();
        }),
    ),
  });
  client.writeQuery({
    query: MeDocument,
    data: {
      me: {
        __typename: 'User',
        id: 'viewer',
        nickname: '나',
        avatar: null,
        isAnonymous: false,
        needsOnboarding: false,
      },
    },
  });
  client.writeFragment({ fragment: GroupContestSummaryFragmentDoc, data: CONTEST });
  const entries = [
    entry('post-a', '점심의 순간'),
    entry('post-b', '퇴근길 노을'),
    entry('post-mine', '내 사진', 'viewer'),
  ];
  for (const post of entries)
    client.writeFragment({
      fragment: GalleryPostCardFragmentDoc,
      fragmentName: 'GalleryPostCard',
      data: post,
    });
  render(
    <ApolloProvider client={client}>
      {entries.map((post) => (
        <GroupContestVoteButton key={post.id} contestId="contest-1" postId={post.id} />
      ))}
    </ApolloProvider>,
  );
  return { user, votes };
}

describe('GroupContestVoteButton 접근성 이름 회귀', () => {
  it('버튼 이름은 보이는 투표 상태로 시작하고 투표한 뒤의 상태도 이름으로 알려야 한다', async () => {
    const { user } = renderVoteButtons();
    const lunch = screen.getByRole('button', { name: '이 참여작에 투표하기 (점심의 순간)' });
    expect(lunch).not.toHaveAttribute('aria-label');
    expect(screen.getByRole('button', { name: '내가 올린 참여작 (내 사진)' })).toBeInTheDocument();

    await user.click(lunch);

    await waitFor(() => expect(lunch).toHaveAccessibleName('내가 투표한 참여작 (점심의 순간)'));
    expect(screen.getByRole('button', { name: '투표 완료 (퇴근길 노을)' })).toBeInTheDocument();
  });

  it('키보드로 투표한 뒤 잠긴 버튼도 포커스를 지키고 Tab으로 다른 참여작의 상태를 들을 수 있어야 한다', async () => {
    const { user, votes } = renderVoteButtons();
    const lunch = screen.getByRole('button', { name: '이 참여작에 투표하기 (점심의 순간)' });
    lunch.focus();

    await user.keyboard('{Enter}');

    await waitFor(() => expect(lunch).toHaveAccessibleName('내가 투표한 참여작 (점심의 순간)'));
    expect(lunch).toHaveFocus();
    await user.tab();
    const sunset = screen.getByRole('button', { name: '투표 완료 (퇴근길 노을)' });
    expect(sunset).toHaveFocus();
    expect(sunset).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Enter}');
    expect(votes).toEqual([{ contestId: 'contest-1', postId: 'post-a' }]);
  });
});
