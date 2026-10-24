import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider, useQuery } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { submissionTypePolicies } from '@/features/submission';
import {
  ContestDocument,
  DeleteSubmissionDocument,
  HideSubmissionDocument,
  Phase,
  ReportSubmissionDocument,
  SubmissionsDocument,
  SubmissionSort,
  type ContestQuery,
  type SubmissionCardFragment,
} from '@/shared/api/generated';
import { trackEvent } from '@/shared/model/analytics';
import { toast } from '@/shared/model/toast';

import { ModerationActions } from './ModerationActions';

vi.mock('@/shared/model/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

const FEED = { contestId: 'contest-1', sort: SubmissionSort.Newest, offset: 0, limit: 24 };

const photo = (id: string, overrides: Partial<SubmissionCardFragment> = {}): SubmissionCardFragment => ({
  __typename: 'Submission',
  id,
  contestId: 'contest-1',
  caption: `${id} 캡션`,
  imageUrl: `/backend/photos/${id}`,
  hidden: false,
  createdAt: '2026-10-14T04:00:00.000Z',
  voteCount: null,
  likeCount: 0,
  likedByMe: false,
  reportCount: 1,
  author: { __typename: 'User', id: 'author-1', nickname: '수아', avatar: null },
  reports: [
    {
      __typename: 'Report',
      id: 'report-1',
      reason: '동의 없이 올린 사진',
      createdAt: '2026-10-14T05:00:00.000Z',
    },
  ],
  ...overrides,
});

const contest = (overrides: Partial<ContestQuery['contest']> = {}): ContestQuery['contest'] => ({
  __typename: 'Contest',
  id: 'contest-1',
  groupId: 'group-1',
  title: '가을 사진전',
  phase: Phase.Submission,
  startsAt: '2026-10-10T03:00:00.000Z',
  submissionEndsAt: '2026-10-17T03:00:00.000Z',
  endsAt: '2026-10-21T03:00:00.000Z',
  isAdmin: true,
  mySubmissionId: null,
  votedSubmissionId: null,
  submissionCount: 2,
  hiddenSubmissions: [],
  ...overrides,
});

/** 피드처럼 숨긴 사진을 빼고 그린다. */
function Feed({ isAdmin }: { isAdmin: boolean }) {
  const { data } = useQuery(SubmissionsDocument, { variables: FEED });
  return (
    <ul>
      {data?.submissions
        .filter((submission) => !submission.hidden)
        .map((submission) => (
          <li key={submission.id} aria-label={submission.caption}>
            <ModerationActions
              submission={submission}
              contestId="contest-1"
              isAdmin={isAdmin}
              isMine={submission.author.id === 'viewer'}
              isCompleted={false}
            />
          </li>
        ))}
    </ul>
  );
}

function renderFeed({ isAdmin, mocks = [] }: { isAdmin: boolean; mocks?: MockLink.MockedResponse[] }) {
  const user = userEvent.setup();
  const client = new ApolloClient({
    cache: new InMemoryCache({ typePolicies: submissionTypePolicies }),
    link: new MockLink(mocks),
  });
  client.writeQuery({ query: ContestDocument, variables: { id: 'contest-1' }, data: { contest: contest() } });
  client.writeQuery({
    query: SubmissionsDocument,
    variables: FEED,
    data: {
      submissions: [
        photo('photo-a'),
        photo('photo-b'),
        photo('photo-mine', { author: { __typename: 'User', id: 'viewer', nickname: '나', avatar: null } }),
      ],
    },
  });
  render(
    <ApolloProvider client={client}>
      <OverlayProvider>
        <Feed isAdmin={isAdmin} />
      </OverlayProvider>
    </ApolloProvider>,
  );
  return { user, client };
}

const item = (caption: string) => screen.getByRole('listitem', { name: caption });
const contestRefetch = (overrides: Partial<ContestQuery['contest']>): MockLink.MockedResponse => ({
  request: { query: ContestDocument, variables: { id: 'contest-1' } },
  result: { data: { contest: contest(overrides) } },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(toast, 'success');
});

afterEach(() => {
  act(() => overlay.unmountAll());
});

describe('ModerationActions', () => {
  it('일반 멤버는 남의 사진만 신고할 수 있고 관리 버튼은 보지 않아야 한다', () => {
    renderFeed({ isAdmin: false });

    expect(within(item('photo-a 캡션')).getByRole('button', { name: '신고' })).toBeVisible();
    expect(within(item('photo-mine 캡션')).queryByRole('button', { name: '신고' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '숨기기' })).not.toBeInTheDocument();
    expect(screen.queryByText('신고 1건')).not.toBeInTheDocument();
  });

  it('신고 이유 없이 제출하면 안내하고, Escape로 닫으면 신고 버튼으로 포커스가 돌아가야 한다', async () => {
    const { user } = renderFeed({ isAdmin: false });
    const reportButton = within(item('photo-a 캡션')).getByRole('button', { name: '신고' });

    await user.click(reportButton);
    await screen.findByRole('dialog', { name: '사진 신고하기' });
    await user.click(screen.getByRole('button', { name: '신고 제출' }));
    expect(await screen.findByText('신고 이유를 입력해 주세요.')).toBeVisible();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(reportButton).toHaveFocus());
  });

  it('신고하면 접수 안내를 보여 주고 이벤트를 보내야 한다', async () => {
    const { user } = renderFeed({
      isAdmin: false,
      mocks: [
        {
          request: {
            query: ReportSubmissionDocument,
            variables: { submissionId: 'photo-a', reason: '동의 없이 올린 사진' },
          },
          result: { data: { reportSubmission: true } },
        },
      ],
    });

    await user.click(within(item('photo-a 캡션')).getByRole('button', { name: '신고' }));
    await user.type(await screen.findByLabelText('신고 이유'), ' 동의 없이 올린 사진 ');
    await user.click(screen.getByRole('button', { name: '신고 제출' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('신고를 접수했어요', expect.anything()));
    expect(trackEvent).toHaveBeenCalledWith('photo_reported', { contest_id: 'contest-1' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('관리자는 신고 수와 내용을 보고 숨기면 피드에서 바로 빠져야 한다', async () => {
    const { user, client } = renderFeed({
      isAdmin: true,
      mocks: [
        {
          request: { query: HideSubmissionDocument, variables: { submissionId: 'photo-a' } },
          result: { data: { hideSubmission: true } },
        },
        contestRefetch({ submissionCount: 1, hiddenSubmissions: [photo('photo-a', { hidden: true })] }),
        {
          request: { query: SubmissionsDocument, variables: FEED },
          result: {
            data: {
              submissions: [
                photo('photo-b'),
                photo('photo-mine', {
                  author: { __typename: 'User', id: 'viewer', nickname: '나', avatar: null },
                }),
              ],
            },
          },
        },
      ],
    });
    const card = item('photo-a 캡션');
    expect(within(card).getByText('신고 1건')).toBeVisible();
    expect(within(card).getByText('동의 없이 올린 사진')).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: '숨기기' }));

    await waitFor(() =>
      expect(screen.queryByRole('listitem', { name: 'photo-a 캡션' })).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        client.readQuery({ query: ContestDocument, variables: { id: 'contest-1' } })?.contest
          .hiddenSubmissions,
      ).toHaveLength(1),
    );
    expect(toast.success).toHaveBeenCalledWith('사진을 숨겼어요', expect.anything());
  });

  it('관리자가 삭제를 확인하면 사진을 캐시에서 지워야 한다', async () => {
    const { user } = renderFeed({
      isAdmin: true,
      mocks: [
        {
          request: { query: DeleteSubmissionDocument, variables: { submissionId: 'photo-b' } },
          result: { data: { deleteSubmission: true } },
        },
        contestRefetch({ submissionCount: 1 }),
        {
          request: { query: SubmissionsDocument, variables: FEED },
          result: {
            data: {
              submissions: [
                photo('photo-a'),
                photo('photo-mine', {
                  author: { __typename: 'User', id: 'viewer', nickname: '나', avatar: null },
                }),
              ],
            },
          },
        },
      ],
    });

    await user.click(within(item('photo-b 캡션')).getByRole('button', { name: '삭제' }));
    const dialog = await screen.findByRole('alertdialog', { name: '사진을 삭제할까요?' });
    await user.click(within(dialog).getByRole('button', { name: '사진 삭제하기' }));

    // 대화상자가 닫혀야 뒤 화면이 다시 보조기기에 드러난다.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.queryByRole('listitem', { name: 'photo-b 캡션' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('listitem', { name: 'photo-a 캡션' })).toBeVisible();
    expect(toast.success).toHaveBeenCalledWith('사진을 삭제했어요');
  });
});
