import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { OverlayProvider, overlay } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateContestDocument, GroupDocument, GroupRole, Phase } from '@/shared/api/generated';
import type { ContestListItemFragment } from '@/shared/api/generated';
import { trackEvent } from '@/shared/model/analytics';

import { CreateContestBottomSheet } from './CreateContestBottomSheet';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  forward: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/shared/model/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

const NOW = new Date('2026-10-14T03:00:00.000Z');

const contest: ContestListItemFragment = {
  __typename: 'Contest',
  id: 'contest-new',
  groupId: 'group-1',
  title: '가을 사진전',
  phase: Phase.Submission,
  startsAt: '2026-10-14T03:00:00.000Z',
  submissionEndsAt: '2026-10-17T03:00:00.000Z',
  endsAt: '2026-10-21T03:00:00.000Z',
};

function renderSheet(mocks: MockLink.MockedResponse[] = []) {
  const user = userEvent.setup();
  const client = new ApolloClient({ cache: new InMemoryCache(), link: new MockLink(mocks) });
  client.writeQuery({
    query: GroupDocument,
    variables: { id: 'group-1' },
    data: {
      group: {
        __typename: 'Group',
        description: '',
        avatarUrl: null,
        id: 'group-1',
        name: '웃음 연구소',
        role: GroupRole.Owner,
        inviteToken: 'token-1',
        members: [],
        contests: [],
      },
    },
  });
  render(
    <ApolloProvider client={client}>
      <OverlayProvider>
        <button
          type="button"
          onClick={() =>
            overlay.open(({ isOpen, close, unmount }) => (
              <CreateContestBottomSheet groupId="group-1" isOpen={isOpen} onClose={close} unmount={unmount} />
            ))
          }
        >
          대회 열기
        </button>
      </OverlayProvider>
    </ApolloProvider>,
  );
  return { user, client, opener: screen.getByRole('button', { name: '대회 열기' }) };
}

const submitButton = () => screen.getAllByRole('button', { name: '대회 열기' }).at(-1);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
  act(() => overlay.unmountAll());
});

describe('CreateContestBottomSheet', () => {
  it('제목이 없거나 순서가 틀리면 칸마다 알려야 한다', async () => {
    const { user, opener } = renderSheet();
    await user.click(opener);
    await screen.findByRole('dialog', { name: '새 사진 대회 열기' });

    fireEvent.change(screen.getByLabelText('사진 제출 마감'), { target: { value: '2026-10-13T12:00' } });
    await user.click(submitButton() ?? opener);

    expect(await screen.findByText('대회 제목을 입력해 주세요.')).toBeVisible();
    expect(screen.queryByText('사진 제출 마감은 시작보다 뒤여야 해요.')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('대회 제목'), '가을 사진전');
    await user.click(submitButton() ?? opener);
    expect(await screen.findByText('사진 제출 마감은 시작보다 뒤여야 해요.')).toBeVisible();
  });

  it('닫기 버튼으로 닫으면 시트를 연 버튼으로 포커스가 돌아가야 한다', async () => {
    const { user, opener } = renderSheet();
    await user.click(opener);
    await screen.findByRole('dialog', { name: '새 사진 대회 열기' });

    await user.click(screen.getByRole('button', { name: '닫기' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('기본 일정으로 대회를 열면 그룹 목록에 넣고 대회 화면으로 가야 한다', async () => {
    const { user, opener, client } = renderSheet([
      {
        request: {
          query: CreateContestDocument,
          variables: {
            groupId: 'group-1',
            title: '가을 사진전',
            startsAt: '2026-10-14T03:00:00.000Z',
            submissionEndsAt: '2026-10-17T03:00:00.000Z',
            endsAt: '2026-10-21T03:00:00.000Z',
          },
        },
        result: { data: { createContest: contest } },
      },
    ]);
    await user.click(opener);
    await screen.findByRole('dialog', { name: '새 사진 대회 열기' });

    await user.type(screen.getByLabelText('대회 제목'), '가을 사진전');
    await user.click(submitButton() ?? opener);

    await waitFor(() =>
      expect([...router.push.mock.calls, ...router.replace.mock.calls].map(([href]) => href)).toEqual([
        '/contests/contest-new',
      ]),
    );
    expect(trackEvent).toHaveBeenCalledWith('contest_created', {
      group_id: 'group-1',
      contest_id: 'contest-new',
    });
    expect(
      client
        .readQuery({ query: GroupDocument, variables: { id: 'group-1' } })
        ?.group.contests.map((item) => item.id),
    ).toEqual(['contest-new']);
  });
});
