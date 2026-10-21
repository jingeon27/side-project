import { ApolloClient, ApolloLink, gql, InMemoryCache } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { createErrorToastLink, createNoNetworkLink } from './apollo-link.helper';

const JOIN = gql`
  mutation Join($token: String!) {
    joinGroup(token: $token) {
      id
    }
  }
`;
const ME = gql`
  query Me {
    me {
      id
    }
  }
`;

const failingLink = new ApolloLink(() =>
  of({
    data: null,
    errors: [{ message: '유효하지 않은 초대 링크입니다.', extensions: { code: 'NOT_FOUND' } }],
  }),
);

function createClient(notify: (message: string) => void) {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([createErrorToastLink(notify), failingLink]),
  });
}

describe('createErrorToastLink', () => {
  it('mutation이 실패하면 서버 안내문을 한 번 알리고 오류는 호출한 쪽으로 그대로 넘겨야 한다', async () => {
    const notify = vi.fn();
    await expect(
      createClient(notify).mutate({ mutation: JOIN, variables: { token: 't' } }),
    ).rejects.toSatisfy(CombinedGraphQLErrors.is);
    expect(notify).toHaveBeenCalledExactlyOnceWith('유효하지 않은 초대 링크입니다.');
  });

  it('조회 실패는 화면이 보여 주므로 기본으로는 알리지 않아야 한다', async () => {
    const notify = vi.fn();
    await expect(createClient(notify).query({ query: ME })).rejects.toThrow();
    expect(notify).not.toHaveBeenCalled();
  });

  it('operation context로 알림을 켜고 끌 수 있어야 한다', async () => {
    const notify = vi.fn();
    const client = createClient(notify);
    await expect(
      client.mutate({ mutation: JOIN, variables: { token: 't' }, context: { errorToast: false } }),
    ).rejects.toThrow();
    expect(notify).not.toHaveBeenCalled();

    await expect(client.query({ query: ME, context: { errorToast: true } })).rejects.toThrow();
    expect(notify).toHaveBeenCalledOnce();
  });
});

describe('createNoNetworkLink', () => {
  it('SSR에서 직접 요청하면 네트워크 없이 바로 실패해야 한다', async () => {
    const client = new ApolloClient({ cache: new InMemoryCache(), link: createNoNetworkLink() });
    await expect(client.query({ query: ME })).rejects.toThrow('PreloadQuery');
  });
});
