import { useEffect } from 'react';

import { gql, type ApolloClient } from '@apollo/client';
import { resetApolloClientSingletons } from '@apollo/client-integration-nextjs';
import { useApolloClient } from '@apollo/client/react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { AuthSessionSync } from '@/features/auth';
import {
  CreatePostCommentDocument,
  LoginWithPasswordDocument,
  MeDocument,
  type MeQuery,
} from '@/shared/api/generated';
import { reloadDocument } from '@/shared/lib/document-navigation.helper';

import { AppApolloProvider } from './AppApolloProvider';

vi.mock('@/shared/model/toast', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/shared/lib/document-navigation.helper', () => ({
  navigateDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/groups/shared',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const ALICE: NonNullable<MeQuery['me']> = {
  __typename: 'User',
  id: 'alice',
  nickname: 'Alice',
  avatar: null,
  needsOnboarding: false,
  isAnonymous: false,
};
const BOB = { ...ALICE, id: 'bob', nickname: 'Bob' };
const PRIVATE_QUERY = gql`
  query PrivateDraft {
    privateDraft
  }
`;

async function renderClient(sync = false) {
  const ready = Promise.withResolvers<ApolloClient>();
  function ClientReader() {
    const client = useApolloClient();
    useEffect(() => {
      ready.resolve(client);
      return () => client.stop();
    }, [client]);
    return null;
  }
  render(
    <AppApolloProvider>
      {sync ? <AuthSessionSync /> : null}
      <ClientReader />
    </AppApolloProvider>,
  );
  return ready.promise;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/groups/shared');
});
afterEach(() => {
  cleanup();
  resetApolloClientSingletons();
  vi.unstubAllGlobals();
});

it('다른 탭에서 쿠키 계정이 바뀌면 이전 화면의 댓글을 새 계정으로 작성하거나 자동 재전송하지 않아야 한다', async () => {
  const posted: string[] = [];
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      requests.push(body.operationName);
      if (body.operationName === 'Me') return Response.json({ data: { me: BOB } });
      const expected = new Headers(init.headers).get('X-Expected-Viewer-Id');
      if (expected && expected !== BOB.id)
        return Response.json({
          errors: [{ message: '세션이 바뀌었습니다.', extensions: { code: 'UNAUTHENTICATED' } }],
        });
      posted.push(BOB.id);
      return Response.json({
        data: {
          createPostComment: {
            __typename: 'PostComment',
            id: 'comment',
            postId: 'shared-post',
            parentId: null,
            body: 'Alice가 입력한 댓글',
            createdAt: '2026-10-30T00:00:00.000Z',
            replyCount: 0,
            likeCount: 0,
            likedByMe: false,
            canInteract: true,
            canDelete: true,
            author: BOB,
          },
        },
      });
    }),
  );
  const client = await renderClient();
  client.writeQuery({ query: MeDocument, data: { me: ALICE } });
  client.writeQuery({ query: PRIVATE_QUERY, data: { privateDraft: 'Alice 전용 정보' } });

  await act(async () => {
    await expect(
      client.mutate({
        mutation: CreatePostCommentDocument,
        variables: { postId: 'shared-post', body: 'Alice가 입력한 댓글' },
      }),
    ).rejects.toThrow();
  });
  await waitFor(() => expect(client.readQuery({ query: MeDocument })?.me?.id).toBe('bob'));
  expect(posted).toEqual([]);
  expect(requests.filter((name) => name === 'CreatePostComment')).toHaveLength(1);
  expect(client.readQuery({ query: PRIVATE_QUERY })).toBeNull();
  // 문서 교체 전 남아 있는 이전 폼이 새 Me의 ID로 다시 전송돼서도 안 된다.
  await expect(
    client.mutate({
      mutation: CreatePostCommentDocument,
      variables: { postId: 'shared-post', body: 'Alice가 입력한 댓글' },
    }),
  ).rejects.toThrow();
  expect(requests.filter((name) => name === 'CreatePostComment')).toHaveLength(1);
});

it.each(['focus', 'visibilitychange', 'storage'])(
  '%s에서 계정 변경을 확인하면 이전 개인 캐시를 지우고 새 사용자로 문서를 다시 열어야 한다',
  async (event) => {
    const server = { me: ALICE };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: { me: server.me } })),
    );
    const client = await renderClient(true);
    await waitFor(() => expect(client.readQuery({ query: MeDocument })?.me?.id).toBe('alice'));
    client.writeQuery({ query: PRIVATE_QUERY, data: { privateDraft: 'Alice 전용 정보' } });
    server.me = BOB;

    act(() => {
      if (event === 'visibilitychange') document.dispatchEvent(new Event(event));
      if (event === 'focus') window.dispatchEvent(new Event(event));
      if (event === 'storage')
        window.dispatchEvent(new StorageEvent(event, { key: 'photo-contest:session-changed' }));
    });
    await waitFor(() => expect(reloadDocument).toHaveBeenCalledOnce());
    expect(client.readQuery({ query: MeDocument })?.me?.id).toBe('bob');
    expect(client.readQuery({ query: PRIVATE_QUERY })).toBeNull();
  },
);

it('같은 계정으로 복귀하면 개인 캐시와 작성 중인 화면을 유지해야 한다', async () => {
  const fetch = vi.fn(async () => Response.json({ data: { me: ALICE } }));
  vi.stubGlobal('fetch', fetch);
  const client = await renderClient(true);
  await waitFor(() => expect(client.readQuery({ query: MeDocument })?.me?.id).toBe('alice'));
  client.writeQuery({ query: PRIVATE_QUERY, data: { privateDraft: '작성 중인 정보' } });
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(client.readQuery({ query: PRIVATE_QUERY })).toEqual({ privateDraft: '작성 중인 정보' });
  expect(reloadDocument).not.toHaveBeenCalled();
});

it('이전 계정의 늦은 조회 응답이 새 계정 캐시를 다시 채우지 못하게 해야 한다', async () => {
  const server = { me: ALICE };
  const delayed = Promise.withResolvers<Response>();
  const fetch = vi.fn(async (_input, init: RequestInit) => {
    const { operationName } = JSON.parse(String(init.body));
    if (operationName === 'PrivateDraft') return delayed.promise;
    return Response.json({ data: { me: server.me } });
  });
  vi.stubGlobal('fetch', fetch);
  const client = await renderClient(true);
  await waitFor(() => expect(client.readQuery({ query: MeDocument })?.me?.id).toBe('alice'));
  const previous = client.query({ query: PRIVATE_QUERY, fetchPolicy: 'network-only' }).then(
    () => 'completed',
    () => 'cancelled',
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  server.me = BOB;
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(reloadDocument).toHaveBeenCalled());
  delayed.resolve(Response.json({ data: { privateDraft: '늦은 Alice 정보' } }));
  expect(await previous).toBe('cancelled');
  expect(client.readQuery({ query: PRIVATE_QUERY })).toBeNull();
  expect(client.readQuery({ query: MeDocument })?.me?.id).toBe('bob');
});

it('더 최신의 세션 확인이 끝났으면 먼저 시작한 확인 결과를 버려야 한다', async () => {
  const deferred = Promise.withResolvers<Response>();
  const responses = [
    Promise.resolve(Response.json({ data: { me: ALICE } })),
    deferred.promise,
    Promise.resolve(Response.json({ data: { me: BOB } })),
  ];
  const fetch = vi.fn(() => responses.shift() ?? Promise.reject(new Error('Unexpected request')));
  vi.stubGlobal('fetch', fetch);
  const client = await renderClient(true);
  await waitFor(() => expect(client.readQuery({ query: MeDocument })?.me?.id).toBe('alice'));
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'photo-contest:session-changed' })));
  await waitFor(() => expect(client.readQuery({ query: MeDocument })?.me?.id).toBe('bob'));
  deferred.resolve(Response.json({ data: { me: ALICE } }));
  await act(async () => {
    await deferred.promise;
  });
  expect(client.readQuery({ query: MeDocument })?.me?.id).toBe('bob');
});

it('의도적으로 다른 계정에 로그인할 때는 이전 사용자 헤더를 붙이지 않아야 한다', async () => {
  const fetch = vi.fn(async (_input, init: RequestInit) => {
    expect(new Headers(init.headers).has('X-Expected-Viewer-Id')).toBe(false);
    return Response.json({ data: { loginWithPassword: BOB } });
  });
  vi.stubGlobal('fetch', fetch);
  const client = await renderClient();
  client.writeQuery({ query: MeDocument, data: { me: ALICE } });
  await client.mutate({
    mutation: LoginWithPasswordDocument,
    variables: { loginId: 'bob', password: 'password-for-test' },
  });
  expect(fetch).toHaveBeenCalledOnce();
});
