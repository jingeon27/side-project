import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider, useQuery } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createErrorToastLink } from '@/shared/api/apollo-link.helper';
import { CastVoteDocument, ContestDocument, Phase } from '@/shared/api/generated';
import type { ContestQuery } from '@/shared/api/generated';
import { trackEvent } from '@/shared/model/analytics';
import { toast } from '@/shared/model/toast';

import { VoteButton } from './VoteButton';

vi.mock('@/shared/model/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

const CONTEST: ContestQuery['contest'] = {
  __typename: 'Contest',
  id: 'contest-1',
  groupId: 'group-1',
  title: '가을 사진전',
  phase: Phase.Voting,
  startsAt: '2026-10-10T03:00:00.000Z',
  submissionEndsAt: '2026-10-13T03:00:00.000Z',
  endsAt: '2026-10-21T03:00:00.000Z',
  isAdmin: false,
  mySubmissionId: 'photo-mine',
  votedSubmissionId: null,
  submissionCount: 3,
  hiddenSubmissions: [],
};

/** 대회 화면처럼 Contest.votedSubmissionId를 구독하는 두 장의 사진 */
function VotingFeed() {
  const { data } = useQuery(ContestDocument, { variables: { id: 'contest-1' }, fetchPolicy: 'cache-only' });
  if (!data) return null;
  const { votedSubmissionId } = data.contest;
  return (
    <>
      {['photo-a', 'photo-b', 'photo-mine'].map((id) => (
        <article key={id} aria-label={id}>
          <VoteButton
            contestId="contest-1"
            submissionId={id}
            votedSubmissionId={votedSubmissionId}
            isMine={id === 'photo-mine'}
            isHidden={false}
          />
        </article>
      ))}
    </>
  );
}

function renderFeed(mocks: MockLink.MockedResponse[]) {
  const user = userEvent.setup();
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([createErrorToastLink((message) => toast.error(message)), new MockLink(mocks)]),
  });
  client.writeQuery({ query: ContestDocument, variables: { id: 'contest-1' }, data: { contest: CONTEST } });
  render(
    <ApolloProvider client={client}>
      <VotingFeed />
    </ApolloProvider>,
  );
  return { user, client };
}

const card = (id: string) => screen.getByRole('article', { name: id });
const voteRequest = { query: CastVoteDocument, variables: { contestId: 'contest-1', submissionId: 'photo-a' } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(toast, 'error');
});

describe('VoteButton', () => {
  it('누르는 즉시 내가 뽑은 사진으로 바꾸고 다른 사진은 투표 완료로 막아야 한다', async () => {
    const { user, client } = renderFeed([
      {
        request: voteRequest,
        result: {
          data: { castVote: { __typename: 'Vote', id: 'vote-1', contestId: 'contest-1', submissionId: 'photo-a' } },
        },
        delay: 30,
      },
    ]);

    await user.click(screen.getAllByRole('button', { name: '이 사진에 한 표!' })[0] ?? card('photo-a'));

    expect(screen.getByRole('button', { name: '내가 뽑은 사진' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '투표 완료' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '내 사진에는 투표할 수 없어요' })).toBeDisabled();
    await waitFor(() => expect(trackEvent).toHaveBeenCalledWith('vote_cast', { contest_id: 'contest-1' }));
    expect(client.readQuery({ query: ContestDocument, variables: { id: 'contest-1' } })?.contest.votedSubmissionId).toBe(
      'photo-a',
    );
  });

  it('투표가 실패하면 낙관적 투표를 되돌리고 다시 누를 수 있어야 한다', async () => {
    const { user, client } = renderFeed([
      {
        request: voteRequest,
        result: { errors: [{ message: '요청이 겹쳤습니다. 다시 시도해 주세요.', extensions: { code: 'CONFLICT' } }] },
        delay: 30,
      },
    ]);

    await user.click(screen.getAllByRole('button', { name: '이 사진에 한 표!' })[0] ?? card('photo-a'));
    expect(screen.getByRole('button', { name: '내가 뽑은 사진' })).toBeVisible();

    await waitFor(() => expect(screen.getAllByRole('button', { name: '이 사진에 한 표!' })).toHaveLength(2));
    expect(screen.getAllByRole('button', { name: '이 사진에 한 표!' })[0]).toBeEnabled();
    expect(toast.error).toHaveBeenCalledWith('요청이 겹쳤습니다. 다시 시도해 주세요.');
    expect(trackEvent).not.toHaveBeenCalled();
    expect(
      client.readQuery({ query: ContestDocument, variables: { id: 'contest-1' } })?.contest.votedSubmissionId,
    ).toBeNull();
  });
});
