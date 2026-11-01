import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { OverlayProvider } from 'overlay-kit';
import { describe, expect, it, vi } from 'vitest';

import { GroupVisibility } from '@/shared/api/generated';

import { GroupPageTemplate } from '../../GroupPageTemplate';

vi.mock('next/navigation', () => ({
  usePathname: () => '/groups/group-1',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const privateGroup = (joinRequestPending: boolean) => ({
  group: {
    __typename: 'Group',
    id: 'group-1',
    name: '비공개 웃음',
    description: '',
    avatarUrl: null,
    coverUrl: null,
    visibility: GroupVisibility.Private,
    role: null,
    memberCount: 3,
    canViewPosts: false,
    joinRequestPending,
    inviteToken: null,
    members: [],
    categories: [],
  },
});

describe('PrivateGroupNotice 회귀', () => {
  it('승인 확인 실패를 알리고 같은 화면에서 재시도한 뒤 오류를 해제해야 한다', async () => {
    const operations: string[] = [];
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new ApolloLink(
        (operation) =>
          new Observable((sink) => {
            operations.push(operation.operationName ?? '');
            if (operation.operationName === 'Me') {
              queueMicrotask(() => {
                sink.next({ data: { me: null } });
                sink.complete();
              });
              return;
            }
            const attempt = operations.filter((name) => name === 'Gallery').length;
            queueMicrotask(() => {
              if (attempt === 2) {
                sink.error(new Error('Network request failed'));
                return;
              }
              sink.next({ data: privateGroup(true) });
              sink.complete();
            });
          }),
      ),
    });
    await act(async () => {
      render(
        <ApolloProvider client={client}>
          <OverlayProvider>
            <GroupPageTemplate id="group-1" />
          </OverlayProvider>
        </ApolloProvider>,
      );
    });
    const notice = await screen.findByRole('region', { name: '비공개 그룹 안내' });
    const check = screen.getByRole('button', { name: '승인 상태 확인' });
    await userEvent.click(check);
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('승인 상태를 확인하지 못했어요.');
    expect(check).toHaveAttribute('aria-describedby', error.id);
    expect(screen.getByRole('region', { name: '비공개 그룹 안내' })).toBe(notice);
    expect(screen.queryByRole('link', { name: '글쓰기' })).not.toBeInTheDocument();
    await userEvent.click(check);
    await waitFor(() => expect(operations.filter((name) => name === 'Gallery')).toHaveLength(3));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(check).not.toHaveAttribute('aria-describedby');
    expect(screen.getByRole('region', { name: '비공개 그룹 안내' })).toBe(notice);
  });

  it('승인 상태를 확인하는 동안 그룹 화면을 로딩으로 바꾸지 않고 안내를 유지해야 한다', async () => {
    const operations: string[] = [];
    const pending: Array<() => void> = [];
    const link = new ApolloLink(
      (operation) =>
        new Observable((sink) => {
          operations.push(operation.operationName ?? '');
          // 상단바의 알림 버튼이 보는 사람을 조회한다.
          if (operation.operationName === 'Me') {
            queueMicrotask(() => {
              sink.next({ data: { me: null } });
              sink.complete();
            });
            return;
          }
          const first = operations.filter((name) => name === 'Gallery').length === 1;
          const respond = () => {
            // 두 번째 응답은 신청이 거절되어 대기 상태가 풀린 결과다.
            sink.next({ data: privateGroup(first) });
            sink.complete();
          };
          if (first) {
            queueMicrotask(respond);
            return;
          }
          pending.push(respond);
        }),
    );
    const client = new ApolloClient({ cache: new InMemoryCache(), link });
    const user = userEvent.setup();
    await act(async () => {
      render(
        <ApolloProvider client={client}>
          <OverlayProvider>
            <GroupPageTemplate id="group-1" />
          </OverlayProvider>
        </ApolloProvider>,
      );
    });
    const notice = await screen.findByRole('region', { name: '비공개 그룹 안내' });

    await user.click(screen.getByRole('button', { name: '승인 상태 확인' }));
    await waitFor(() => expect(operations.filter((name) => name === 'Gallery')).toHaveLength(2));
    expect(screen.getByRole('region', { name: '비공개 그룹 안내' })).toBe(notice);
    expect(screen.getByRole('heading', { level: 1, name: '비공개 웃음' })).toBeVisible();
    expect(screen.getByRole('button', { name: '승인 상태 확인' })).toHaveAttribute('aria-busy', 'true');

    await act(async () => pending.splice(0).forEach((respond) => respond()));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '승인 상태 확인' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('region', { name: '비공개 그룹 안내' })).toBeVisible();
  });
});
