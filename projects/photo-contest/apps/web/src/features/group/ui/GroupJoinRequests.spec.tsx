import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { GroupJoinRequests } from './GroupJoinRequests';

function createClient() {
  const operations: string[] = [];
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(
      (operation) =>
        new Observable((sink) => {
          operations.push(operation.operationName ?? '');
          queueMicrotask(() => {
            sink.next({ data: { groupJoinRequests: [] } });
            sink.complete();
          });
        }),
    ),
  });
  return { client, operations };
}

describe('가입 신청 관리', () => {
  it('서버 HTML에는 제목을 그리고 사전 조회하지 않은 신청 목록은 요청하지 않아야 한다', () => {
    const { client, operations } = createClient();
    const html = renderToString(
      <ApolloProvider client={client}>
        <GroupJoinRequests groupId="group-1" />
      </ApolloProvider>,
    );
    expect(html).toContain('가입 신청 관리');
    expect(operations).toEqual([]);
  });

  it('브라우저에서는 신청 목록을 조회해 보여줘야 한다', async () => {
    const { client, operations } = createClient();
    await act(async () => {
      render(
        <ApolloProvider client={client}>
          <GroupJoinRequests groupId="group-1" />
        </ApolloProvider>,
      );
    });
    expect(await screen.findByText('대기 중인 가입 신청이 없어요.')).toBeVisible();
    expect(operations).toEqual(['GroupJoinRequests']);
  });
});
