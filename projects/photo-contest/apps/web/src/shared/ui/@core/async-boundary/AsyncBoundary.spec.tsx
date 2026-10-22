import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider, useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  InvitePreviewDocument,
  MeDocument,
  type InvitePreviewQuery,
  type MeQuery,
} from '../../../api/generated';
import { AsyncBoundary } from './AsyncBoundary';

const profile = {
  data: { me: { __typename: 'User' as const, id: 'viewer', nickname: '복구된 사용자', avatar: null } },
};
function Profile({ queryRef }: { queryRef: QueryRef<MeQuery> }) {
  const { data } = useReadQuery(queryRef);
  return <p>{data.me?.nickname}</p>;
}
function ProfileScope() {
  const [queryRef, { refetch }] = useBackgroundQuery(MeDocument);
  return (
    <AsyncBoundary fallback={<p role="status">프로필 로딩</p>} onRetry={() => refetch()}>
      <Profile queryRef={queryRef} />
    </AsyncBoundary>
  );
}
function Preview({ queryRef }: { queryRef: QueryRef<InvitePreviewQuery> }) {
  const { data } = useReadQuery(queryRef);
  return <p>{data.invitePreview.groupName}</p>;
}
function PreviewScope({ token = 'first' }: { token?: string }) {
  const [queryRef, { refetch }] = useBackgroundQuery(InvitePreviewDocument, { variables: { token } });
  return (
    <AsyncBoundary resetKey={token} fallback={<p role="status">초대 로딩</p>} onRetry={() => refetch()}>
      <Preview queryRef={queryRef} />
    </AsyncBoundary>
  );
}
function previewMock(token = 'first') {
  return {
    request: { query: InvitePreviewDocument, variables: { token } },
    result: {
      data: {
        invitePreview: {
          __typename: 'InvitePreview',
          groupName: '먼저 열린 그룹',
          ownerNickname: '관리자',
          memberCount: 2,
          joinedGroupId: null,
        },
      },
    },
    delay: 0,
  };
}
afterEach(() => vi.restoreAllMocks());

describe('조회 Suspense·오류 경계', () => {
  it('한 조회가 느려도 안내와 다른 조회를 먼저 보여줘야 한다', async () => {
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new MockLink([{ request: { query: MeDocument }, result: profile, delay: 120 }, previewMock()]),
    });
    await act(async () => {
      render(
        <ApolloProvider client={client}>
          <h1>대회 안내</h1>
          <ProfileScope />
          <PreviewScope />
        </ApolloProvider>,
      );
    });
    expect(screen.getByRole('heading', { name: '대회 안내' })).toBeVisible();
    expect(screen.getByText('프로필 로딩')).toBeVisible();
    expect(await screen.findByText('먼저 열린 그룹')).toBeVisible();
    expect(await screen.findByText('복구된 사용자')).toBeVisible();
  });

  it('실패한 조회만 재시도하고 이미 열린 다른 섹션은 유지해야 한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new MockLink([
        { request: { query: MeDocument }, error: new Error('connection unavailable'), delay: 0 },
        { request: { query: MeDocument }, result: profile, delay: 0 },
        previewMock(),
      ]),
    });
    await act(async () => {
      render(
        <ApolloProvider client={client}>
          <h1>대회 안내</h1>
          <ProfileScope />
          <PreviewScope />
        </ApolloProvider>,
      );
    });
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(await screen.findByText('먼저 열린 그룹')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('복구된 사용자')).toBeVisible();
    expect(screen.getByText('먼저 열린 그룹')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('조회 대상이 바뀌면 이전 대상의 오류를 새 대상에 남기지 않아야 한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new MockLink([
        {
          request: { query: InvitePreviewDocument, variables: { token: 'bad' } },
          error: new Error('failed'),
          delay: 0,
        },
        previewMock('good'),
      ]),
    });
    let rerender: ReturnType<typeof render>['rerender'];
    await act(async () => {
      rerender = render(
        <ApolloProvider client={client}>
          <PreviewScope token="bad" />
        </ApolloProvider>,
      ).rerender;
    });
    expect(await screen.findByRole('alert')).toBeVisible();
    await act(async () => {
      rerender(
        <ApolloProvider client={client}>
          <PreviewScope token="good" />
        </ApolloProvider>,
      );
    });
    expect(await screen.findByText('먼저 열린 그룹')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
