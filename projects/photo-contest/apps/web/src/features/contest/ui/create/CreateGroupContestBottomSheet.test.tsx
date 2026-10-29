import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { EMPTY } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { toDateTimeLocalValue } from '@/shared/lib/format.helper';

import { CreateGroupContestBottomSheet } from './CreateGroupContestBottomSheet';

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

async function openSheet() {
  const user = userEvent.setup();
  const operations: string[] = [];
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) => {
      operations.push(operation.operationName ?? '');
      return EMPTY;
    }),
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
  return { user, operations };
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: '대회 개최하기' }));

afterEach(() => {
  act(() => overlay.unmountAll());
});

describe('CreateGroupContestBottomSheet', () => {
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
