import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createErrorToastLink } from '@/shared/api/apollo-link.helper';
import {
  GalleryPostsDocument,
  GroupRole,
  GroupVisibility,
  MeDocument,
  MyGroupsDocument,
  PostSort,
  type GroupCardFragment,
} from '@/shared/api/generated';
import { trackEvent } from '@/shared/model/analytics';
import { toast } from '@/shared/model/toast';

import { JoinGroupButton } from './JoinGroupButton';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/shared/model/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

const group = (id: string, role: GroupCardFragment['role']): GroupCardFragment => ({
  __typename: 'Group',
  id,
  name: `${id} 이름`,
  description: '',
  avatarUrl: null,
  role,
  memberCount: 3,
});

const HOME_FEED = { groupId: null, sort: PostSort.Newest, offset: 0, limit: 24 };

interface IJoinRequest {
  variables: Record<string, unknown>;
  succeed: (joined: GroupCardFragment) => void;
  failNetwork: () => void;
}

/** 가입 요청을 테스트가 응답할 때까지 붙잡아 진행 중 상태를 확인한다. */
function renderButton({
  visibility,
  isAnonymous = false,
}: { visibility?: GroupVisibility; isAnonymous?: boolean } = {}) {
  const user = userEvent.setup();
  const requests: IJoinRequest[] = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable((sink) => {
        requests.push({
          variables: operation.variables,
          succeed: (joined) => {
            sink.next({ data: { joinGroup: joined } });
            sink.complete();
          },
          failNetwork: () => sink.error(new TypeError('Failed to fetch')),
        });
      }),
  );
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([createErrorToastLink((message) => toast.error(message)), link]),
  });
  client.writeQuery({
    query: MeDocument,
    data: {
      me: {
        __typename: 'User',
        id: 'viewer',
        nickname: '나',
        avatar: null,
        isAnonymous,
        needsOnboarding: false,
      },
    },
  });
  client.writeQuery({ query: MyGroupsDocument, data: { myGroups: [group('group-1', GroupRole.Member)] } });
  client.writeQuery({
    query: GalleryPostsDocument,
    variables: HOME_FEED,
    data: { galleryPostsPage: { __typename: 'GalleryPostPage', items: [], nextOffset: null } },
  });
  render(
    <ApolloProvider client={client}>
      <OverlayProvider>
        <JoinGroupButton token="token-1" visibility={visibility} />
      </OverlayProvider>
    </ApolloProvider>,
  );
  const myGroupIds = () => client.readQuery({ query: MyGroupsDocument })?.myGroups.map(({ id }) => id);
  const homeFeed = () => client.readQuery({ query: GalleryPostsDocument, variables: HOME_FEED });
  return { user, requests, myGroupIds, homeFeed };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(toast, 'error');
});

afterEach(() => {
  act(() => overlay.unmountAll());
});

describe('JoinGroupButton', () => {
  it('가입 중에는 잠가 다시 눌러도 한 번만 보내고, 가입하면 홈 목록 맨 앞에 넣고 그룹 화면으로 옮기는 동안에도 잠가 둬야 한다', async () => {
    const { user, requests, myGroupIds, homeFeed } = renderButton();
    const join = screen.getByRole('button', { name: '초대 수락하고 가입하기' });
    expect(join).not.toHaveAttribute('aria-busy');

    await user.click(join);
    await waitFor(() => expect(join).toHaveAttribute('aria-busy', 'true'));
    await user.click(join);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.variables).toEqual({ token: 'token-1' });

    await act(async () => requests[0]!.succeed(group('group-2', GroupRole.Member)));

    await waitFor(() => expect(router.replace).toHaveBeenCalledExactlyOnceWith('/groups/group-2', undefined));
    // 그룹 화면으로 바뀌기 전까지 다시 눌러 같은 초대를 또 수락하지 못하게 한다.
    expect(join).toHaveAttribute('aria-busy', 'true');
    await user.click(join);
    expect(requests).toHaveLength(1);
    expect(router.push).not.toHaveBeenCalled();
    expect(myGroupIds()).toEqual(['group-2', 'group-1']);
    // 새 그룹의 게시물이 섞이도록 홈 피드를 비워 다시 받게 한다.
    expect(homeFeed()).toBeNull();
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith('group_joined', { group_id: 'group-2' });
  });

  it('가입이 실패하면 이동하지 않고 버튼을 다시 열어 두며, 다시 누르면 가입해야 한다', async () => {
    const { user, requests, myGroupIds } = renderButton();
    const join = screen.getByRole('button', { name: '초대 수락하고 가입하기' });
    await user.click(join);
    await waitFor(() => expect(requests).toHaveLength(1));

    await act(async () => requests[0]!.failNetwork());

    await waitFor(() => expect(join).not.toHaveAttribute('aria-busy'));
    expect(join).toBeEnabled();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith('네트워크 연결을 확인하고 다시 시도해 주세요.');
    expect(router.replace).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
    expect(myGroupIds()).toEqual(['group-1']);

    await user.click(join);
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]!.variables).toEqual({ token: 'token-1' });
    await act(async () => requests[1]!.succeed(group('group-2', GroupRole.Member)));

    await waitFor(() => expect(router.replace).toHaveBeenCalledExactlyOnceWith('/groups/group-2', undefined));
    expect(myGroupIds()).toEqual(['group-2', 'group-1']);
  });

  it('비공개 그룹 가입 신청은 승인 전이라 홈 목록과 가입 이벤트에 넣지 않고 그룹 화면으로 옮겨야 한다', async () => {
    const { user, requests, myGroupIds } = renderButton({ visibility: GroupVisibility.Private });

    await user.click(screen.getByRole('button', { name: '가입 신청하기' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    await act(async () => requests[0]!.succeed(group('group-2', null)));

    await waitFor(() => expect(router.replace).toHaveBeenCalledExactlyOnceWith('/groups/group-2', undefined));
    expect(myGroupIds()).toEqual(['group-1']);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('익명 사용자가 비공개 그룹에 가입하려 하면 요청 없이 로그인을 안내하고, 확인하면 이 초대로 돌아오는 로그인으로 보내야 한다', async () => {
    const { user, requests } = renderButton({ visibility: GroupVisibility.Private, isAnonymous: true });

    await user.click(screen.getByRole('button', { name: '로그인하고 가입 신청하기' }));
    await screen.findByRole('alertdialog', { name: '로그인이 필요해요' });
    expect(requests).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: '로그인하기' }));

    // 안내가 쌓은 history 항목 위에서 이동하므로 앱 router가 push를 replace로 바꾼다.
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledExactlyOnceWith('/sign?next=%2Finvite%2Ftoken-1', undefined),
    );
    expect(requests).toHaveLength(0);
  });
});
