import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider, useBackgroundQuery } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { submissionTypePolicies } from '@/features/submission';
import {
  ContestDocument,
  Phase,
  SubmissionsDocument,
  SubmissionSort,
  type ContestQuery,
  type SubmissionCardFragment,
} from '@/shared/api/generated';

import { ContestFeed } from './ContestFeed';

const CONTEST: ContestQuery['contest'] = {
  __typename: 'Contest',
  id: 'contest',
  groupId: 'group',
  title: '테스트 대회',
  phase: Phase.Submission,
  startsAt: '2026-10-10T00:00:00Z',
  submissionEndsAt: '2026-10-20T00:00:00Z',
  endsAt: '2026-10-21T00:00:00Z',
  isAdmin: true,
  mySubmissionId: null,
  votedSubmissionId: null,
  submissionCount: 24,
  hiddenSubmissions: [],
};
const VARIABLES = { contestId: 'contest', sort: SubmissionSort.Newest, offset: 0, limit: 24 };
const LOADING_MORE = '사진을 더 불러오는 중';

const endObservers = new Set<IntersectionObserverCallback>();
beforeEach(() => {
  endObservers.clear();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe() {
        endObservers.add(this.callback);
      }
      disconnect() {
        endObservers.delete(this.callback);
      }
      takeRecords() {
        return [];
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

/** 피드 끝 지점이 화면 가까이 들어온 것처럼 알린다. */
const reachFeedEnd = () =>
  act(() => {
    endObservers.forEach((callback) =>
      callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
    );
  });

function photo(index: number): SubmissionCardFragment {
  return {
    __typename: 'Submission',
    id: 'photo-' + index,
    contestId: 'contest',
    caption: '사진-' + index,
    imageUrl: '/backend/photos/photo-' + index,
    hidden: index < 6,
    createdAt: '2026-10-15T00:00:00Z',
    voteCount: null,
    likeCount: 0,
    likedByMe: false,
    reportCount: null,
    reports: null,
    author: { __typename: 'User', id: 'author-' + index, nickname: '친구-' + index, avatar: null },
  };
}
function Harness() {
  const [contestRef] = useBackgroundQuery(ContestDocument, {
    variables: { id: 'contest' },
    errorPolicy: 'all',
  });
  return (
    <>
      <h1>대회 안내</h1>
      <ContestFeed contestRef={contestRef} viewerId="viewer" sort="latest" />
    </>
  );
}
function setup(
  extraMocks: MockLink.MockedResponse[] = [],
  initialPhotos = Array.from({ length: 24 }, (_, index) => photo(index)),
  visibleCount = CONTEST.submissionCount,
) {
  const client = new ApolloClient({
    cache: new InMemoryCache({ typePolicies: submissionTypePolicies }),
    link: new MockLink([
      {
        request: { query: SubmissionsDocument, variables: { ...VARIABLES, offset: 24 } },
        result: {
          data: {
            submissionsPage: {
              __typename: 'SubmissionPage',
              items: Array.from({ length: 6 }, (_, index) => photo(index + 24)),
              nextOffset: null,
            },
          },
        },
        delay: 100,
      },
      ...extraMocks,
    ]),
  });
  client.writeQuery({
    query: ContestDocument,
    variables: { id: 'contest' },
    data: { contest: { ...CONTEST, submissionCount: visibleCount } },
  });
  client.writeQuery({
    query: SubmissionsDocument,
    variables: VARIABLES,
    data: { submissionsPage: { __typename: 'SubmissionPage', items: initialPhotos, nextOffset: 24 } },
  });
  render(
    <ApolloProvider client={client}>
      <Harness />
    </ApolloProvider>,
  );
  return { client };
}

describe('사진 피드 조회 맥락', () => {
  it('관리자의 숨긴 사진도 offset에 세고 더 읽는 동안 기존 사진과 안내를 유지해야 한다', async () => {
    setup();
    expect(await screen.findByText('사진-6')).toBeVisible();
    reachFeedEnd();
    expect(await screen.findByText(LOADING_MORE)).toBeInTheDocument();
    expect(screen.getByText('사진-6')).toBeVisible();
    expect(screen.getByRole('heading', { name: '대회 안내' })).toBeVisible();
    expect(await screen.findByText('사진-29')).toBeVisible();
    expect(screen.queryByText('사진-0')).not.toBeInTheDocument();
    expect(screen.queryByText(LOADING_MORE)).not.toBeInTheDocument();
    expect(endObservers.size).toBe(0);
  });

  it('사진 수가 달라져 첫 페이지를 다시 받으면 이전 페이지의 끝 사진을 남기지 않아야 한다', async () => {
    const { client } = setup([
      {
        request: { query: SubmissionsDocument, variables: VARIABLES },
        result: {
          data: { submissionsPage: { __typename: 'SubmissionPage', items: [photo(6)], nextOffset: null } },
        },
        delay: 0,
      },
    ]);
    await screen.findByText('사진-6');
    reachFeedEnd();
    await screen.findByText('사진-29');
    act(() =>
      client.writeQuery({
        query: ContestDocument,
        variables: { id: 'contest' },
        data: { contest: { ...CONTEST, submissionCount: 1 } },
      }),
    );
    await waitFor(() => expect(screen.queryByText('사진-29')).not.toBeInTheDocument());
    expect(screen.getByText('사진-6')).toBeVisible();
    expect(screen.getByRole('heading', { name: '대회 안내' })).toBeVisible();
  });

  it('첫 페이지가 모두 숨긴 사진이어도 남은 공개 사진을 불러올 수 있어야 한다', async () => {
    setup(
      [],
      Array.from({ length: 24 }, (_, index) => ({ ...photo(index), hidden: true })),
      6,
    );
    await waitFor(() => expect(endObservers.size).toBe(1));
    reachFeedEnd();
    expect(await screen.findByText('사진-29')).toBeVisible();
    expect(screen.queryByText('사진-0')).not.toBeInTheDocument();
    expect(endObservers.size).toBe(0);
  });
});
