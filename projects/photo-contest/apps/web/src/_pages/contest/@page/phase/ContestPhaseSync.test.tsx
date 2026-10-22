import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider, useBackgroundQuery, useReadQuery } from '@apollo/client/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContestDocument, Phase, type ContestQuery } from '@/shared/api/generated';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';

import type { TContestQueryRef } from '../model/contest-query.type';
import { ContestPhaseSync } from './ContestPhaseSync';

const CONTEST: ContestQuery['contest'] = {
  __typename: 'Contest',
  id: 'contest-1',
  groupId: 'group-1',
  title: '가을 사진전',
  phase: Phase.Submission,
  startsAt: '2026-10-14T03:00:00.000Z',
  submissionEndsAt: '2026-10-17T03:00:00.000Z',
  endsAt: '2026-10-21T03:00:00.000Z',
  isAdmin: false,
  mySubmissionId: null,
  votedSubmissionId: null,
  submissionCount: 0,
  hiddenSubmissions: [],
};

function ContestTitle({ contestRef }: { contestRef: TContestQueryRef }) {
  const { data } = useReadQuery(contestRef);
  return <h1>{data?.contest.title}</h1>;
}

function ContestScreen() {
  const [contestRef, { refetch }] = useBackgroundQuery(ContestDocument, {
    variables: { id: CONTEST.id },
    errorPolicy: 'all',
  });
  return (
    <AsyncBoundary fallback={<p>불러오는 중</p>} onRetry={refetch}>
      <ContestPhaseSync contestRef={contestRef} />
      <ContestTitle contestRef={contestRef} />
    </AsyncBoundary>
  );
}

afterEach(() => vi.useRealTimers());

describe('ContestPhaseSync', () => {
  it('주기 갱신이 한 번 실패해도 보던 대회 화면을 오류 화면으로 바꾸지 않아야 한다', async () => {
    // 30초 주기만 앞당긴다. React 스케줄러가 쓰는 setImmediate·MessageChannel은 그대로 둔다.
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    let requests = 0;
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new ApolloLink(() => {
        requests += 1;
        return requests === 1
          ? of({ data: { contest: CONTEST } })
          : throwError(() => new Error('Failed to fetch'));
      }),
    });
    await act(async () => {
      render(
        <ApolloProvider client={client}>
          <ContestScreen />
        </ApolloProvider>,
      );
    });
    expect(await screen.findByRole('heading', { name: '가을 사진전' })).toBeVisible();

    await act(() => vi.advanceTimersByTimeAsync(30_000));

    await waitFor(() => expect(requests).toBe(2));
    expect(screen.getByRole('heading', { name: '가을 사진전' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /다시/ })).not.toBeInTheDocument();
  });
});
