import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider, useQuery } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { installFakeNativeApp } from '@photo-contest/bridge/test';
import type { IFakeNativeApp } from '@photo-contest/bridge/test';
import { createWebBridge } from '@photo-contest/bridge/web';
import type { IWebBridge } from '@photo-contest/bridge/web';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createErrorToastLink } from '@/shared/api/apollo-link.helper';
import {
  LikeSubmissionDocument,
  SubmissionSort,
  SubmissionsDocument,
  UnlikeSubmissionDocument,
} from '@/shared/api/generated';
import type { SubmissionCardFragment } from '@/shared/api/generated';
import { trackEvent } from '@/shared/model/analytics';
import { BridgeContext } from '@/shared/model/bridge';
import { toast } from '@/shared/model/toast';

import { LikeButton } from './LikeButton';

vi.mock('@/shared/model/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

const FEED = { contestId: 'contest-1', sort: SubmissionSort.Newest, offset: 0, limit: 24 };

const photo = (overrides: Partial<SubmissionCardFragment> = {}): SubmissionCardFragment => ({
  __typename: 'Submission',
  id: 'photo-1',
  contestId: 'contest-1',
  caption: '고양이 기지개',
  imageUrl: '/backend/photos/photo-1',
  hidden: false,
  createdAt: '2026-10-14T04:00:00.000Z',
  voteCount: null,
  likeCount: 3,
  likedByMe: false,
  reportCount: null,
  author: { __typename: 'User', id: 'author-1', nickname: '수아', avatar: null },
  reports: null,
  ...overrides,
});

/** 피드처럼 캐시를 구독해 낙관적 값과 되돌림이 화면에 반영되는지 본다. */
function FeedLikeButton({ isMine }: { isMine: boolean }) {
  const { data } = useQuery(SubmissionsDocument, { variables: FEED, fetchPolicy: 'cache-only' });
  const submission = data?.submissions[0];
  return submission ? <LikeButton submission={submission} isMine={isMine} /> : null;
}

let fake: IFakeNativeApp | null;

function renderButton({
  initial = photo(),
  mocks = [],
  isMine = false,
  bridge = null,
}: {
  initial?: SubmissionCardFragment;
  mocks?: MockLink.MockedResponse[];
  isMine?: boolean;
  bridge?: IWebBridge | null;
} = {}) {
  const user = userEvent.setup();
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([createErrorToastLink((message) => toast.error(message)), new MockLink(mocks)]),
  });
  client.writeQuery({
    query: SubmissionsDocument,
    variables: FEED,
    data: { submissions: [initial] },
  });
  render(
    <ApolloProvider client={client}>
      <BridgeContext value={bridge}>
        <FeedLikeButton isMine={isMine} />
      </BridgeContext>
    </ApolloProvider>,
  );
  return { user };
}

const likeResult = (likeCount: number, likedByMe: boolean) => ({
  __typename: 'Submission' as const,
  id: 'photo-1',
  likeCount,
  likedByMe,
});

beforeEach(() => {
  vi.clearAllMocks();
  fake = null;
  vi.spyOn(toast, 'error');
});

afterEach(() => {
  fake?.uninstall();
});

describe('LikeButton', () => {
  it('누르는 즉시 하트와 수를 바꾸고 성공하면 이벤트를 보내야 한다', async () => {
    const { user } = renderButton({
      mocks: [
        {
          request: { query: LikeSubmissionDocument, variables: { submissionId: 'photo-1' } },
          result: { data: { likeSubmission: likeResult(4, true) } },
          delay: 30,
        },
      ],
    });

    await user.click(screen.getByRole('button', { name: '좋아요 3개' }));

    const pressed = screen.getByRole('button', { name: '좋아요 4개' });
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith('photo_liked', { contest_id: 'contest-1', submission_id: 'photo-1' }),
    );
    expect(screen.getByRole('button', { name: '좋아요 4개' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('서버가 거절하면 원래 수로 되돌리고 토스트로 알려야 한다', async () => {
    const { user } = renderButton({
      mocks: [
        {
          request: { query: LikeSubmissionDocument, variables: { submissionId: 'photo-1' } },
          result: {
            errors: [{ message: '사진을 찾을 수 없습니다.', extensions: { code: 'NOT_FOUND' } }],
          },
          delay: 30,
        },
      ],
    });

    await user.click(screen.getByRole('button', { name: '좋아요 3개' }));
    expect(screen.getByRole('button', { name: '좋아요 4개' })).toHaveAttribute('aria-pressed', 'true');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '좋아요 3개' })).toHaveAttribute('aria-pressed', 'false'),
    );
    expect(toast.error).toHaveBeenCalledWith('사진을 찾을 수 없습니다.');
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('다시 누르면 좋아요를 취소하고 수를 줄여야 한다', async () => {
    const { user } = renderButton({
      initial: photo({ likeCount: 4, likedByMe: true }),
      mocks: [
        {
          request: { query: UnlikeSubmissionDocument, variables: { submissionId: 'photo-1' } },
          result: { data: { unlikeSubmission: likeResult(3, false) } },
        },
      ],
    });

    await user.click(screen.getByRole('button', { name: '좋아요 4개' }));

    expect(screen.getByRole('button', { name: '좋아요 3개' })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith('photo_unliked', { contest_id: 'contest-1', submission_id: 'photo-1' }),
    );
  });

  it('내 사진은 수만 보여 주고 누를 수 없어야 한다', () => {
    renderButton({ isMine: true });

    const button = screen.getByRole('button', { name: '좋아요 3개' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('내 사진에는 좋아요를 누를 수 없어요');
  });

  it('앱 안이면 좋아요가 성공했을 때 가볍게 진동해야 한다', async () => {
    fake = installFakeNativeApp(window, { capabilities: { 'haptics.impact': async () => ({}) } });
    const { user } = renderButton({
      bridge: createWebBridge(window),
      mocks: [
        {
          request: { query: LikeSubmissionDocument, variables: { submissionId: 'photo-1' } },
          result: { data: { likeSubmission: likeResult(4, true) } },
        },
      ],
    });

    await user.click(screen.getByRole('button', { name: '좋아요 3개' }));

    await waitFor(() => expect(fake?.calls).toEqual([{ type: 'haptics.impact', payload: { style: 'light' } }]));
  });
});
