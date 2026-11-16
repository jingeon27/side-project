import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Phase, type CreateGroupContestMutation } from '@/shared/api/generated';
import { toDateTimeLocalValue } from '@/shared/lib/format.helper';
import { initAnalytics } from '@/shared/model/analytics';
import { resetAnalyticsClientForTest } from '@/shared/model/analytics/analytics.store';

import { CreateGroupContestBottomSheet } from './CreateGroupContestBottomSheet';

const amplitude = vi.hoisted(() => ({ init: vi.fn(), identify: vi.fn(), track: vi.fn() }));
vi.mock('@amplitude/analytics-browser', () => ({
  createInstance: () => amplitude,
  Identify: class {
    set() {
      return this;
    }
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const HOUR = 60 * 60_000;

async function openSheet(apiKey?: string) {
  initAnalytics({ apiKey, app: null });
  const user = userEvent.setup();
  const operations: string[] = [];
  const requests: Array<{ succeed: () => void; fail: () => void }> = [];
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(
      (operation) =>
        new Observable((sink) => {
          operations.push(operation.operationName ?? '');
          requests.push({
            succeed: () => {
              const data: CreateGroupContestMutation = {
                createGroupContest: {
                  __typename: 'GroupContest',
                  id: 'created-contest',
                  groupId: 'group-1',
                  title: String(operation.variables.title),
                  startsAt: operation.variables.startsAt,
                  submissionEndsAt: operation.variables.submissionEndsAt,
                  endsAt: operation.variables.endsAt,
                  likeLimit: 1,
                  phase: Phase.Submission,
                  isAdmin: true,
                  canParticipate: true,
                  canVote: false,
                  votedPostId: null,
                  entryCount: 0,
                },
              };
              sink.next({ data });
              sink.complete();
            },
            fail: () => sink.error(new Error('개최 실패')),
          });
        }),
    ),
  });
  render(
    <ApolloProvider client={client}>
      <OverlayProvider>
        <button
          onClick={() =>
            overlay.open(({ isOpen, close: onClose, unmount }) => (
              <CreateGroupContestBottomSheet
                groupId="group-1"
                isOpen={isOpen}
                onClose={onClose}
                unmount={unmount}
              />
            ))
          }
        >
          대회 개최
        </button>
      </OverlayProvider>
    </ApolloProvider>,
  );
  await user.click(screen.getByRole('button', { name: '대회 개최' }));
  await screen.findByRole('dialog', { name: '그룹 대회 개최' });
  await user.type(screen.getByLabelText('대회 제목', { exact: false }), '웃음 대회');
  return { user, operations, requests };
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: '대회 개최하기' }));

beforeEach(() => {
  vi.clearAllMocks();
  resetAnalyticsClientForTest();
});

afterEach(() => {
  act(() => overlay.unmountAll());
  resetAnalyticsClientForTest();
});

describe('CreateGroupContestBottomSheet', () => {
  it.each([true, false])(
    '키 사용=%s일 때 서버 개최 성공 뒤에만 ID 속성을 한 번 보내야 한다',
    async (enabled) => {
      const { user, requests } = await openSheet(enabled ? 'test-key' : undefined);
      await submit(user);
      await waitFor(() => expect(requests).toHaveLength(1));
      expect(amplitude.track).not.toHaveBeenCalled();
      await act(async () => requests[0]?.succeed());
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: '그룹 대회 개최' })).not.toBeInTheDocument(),
      );
      if (!enabled) {
        expect(amplitude.init).not.toHaveBeenCalled();
        expect(amplitude.track).not.toHaveBeenCalled();
        return;
      }
      expect(amplitude.track).toHaveBeenCalledExactlyOnceWith('contest_created', {
        group_id: 'group-1',
        contest_id: 'created-contest',
      });
    },
  );

  it('개최 실패에는 이벤트를 보내지 않고 같은 초안의 재시도 성공만 기록해야 한다', async () => {
    const { user, requests } = await openSheet('test-key');
    await submit(user);
    await waitFor(() => expect(requests).toHaveLength(1));
    await act(async () => requests[0]?.fail());
    expect(screen.getByLabelText('대회 제목', { exact: false })).toHaveValue('웃음 대회');
    expect(amplitude.track).not.toHaveBeenCalled();
    await submit(user);
    await waitFor(() => expect(requests).toHaveLength(2));
    await act(async () => requests[1]?.succeed());
    await waitFor(() =>
      expect(amplitude.track).toHaveBeenCalledExactlyOnceWith('contest_created', {
        group_id: 'group-1',
        contest_id: 'created-contest',
      }),
    );
  });

  it('좋아요 한도를 비우면 영어 형식 오류 대신 한국어로 알려야 한다', async () => {
    const { user, operations } = await openSheet();
    await user.clear(screen.getByLabelText('1인당 좋아요 한도', { exact: false }));

    await submit(user);

    expect(await screen.findByText('좋아요 한도를 입력해 주세요.')).toBeVisible();
    expect(screen.queryByText(/expected number/i)).not.toBeInTheDocument();
    expect(operations).not.toContain('CreateGroupContest');
  });

  it('시작을 지금으로 당기면 이미 지난 접수 마감을 그 칸에 알리고 개최하지 않아야 한다', async () => {
    const { user, operations } = await openSheet();
    const now = Date.now();
    fireEvent.change(screen.getByLabelText('시작 시각', { exact: false }), {
      target: { value: toDateTimeLocalValue(new Date(now - 2 * HOUR)) },
    });
    fireEvent.change(screen.getByLabelText('게시물 접수 마감', { exact: false }), {
      target: { value: toDateTimeLocalValue(new Date(now - HOUR)) },
    });

    await submit(user);

    const field = screen.getByLabelText('게시물 접수 마감', { exact: false });
    expect(await screen.findByText('마감 시각이 이미 지났어요. 지금보다 뒤로 정해 주세요.')).toBeVisible();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(operations).not.toContain('CreateGroupContest');
  });
});
