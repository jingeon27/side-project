import { Activity } from 'react';

import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EMPTY } from 'rxjs';

import { CreatePostForm } from '../../src/_pages/group-write/ui/CreatePostForm';
import { Phase } from '../../src/shared/api/generated';

/** 접수 중인 그룹 대회. 글쓰기의 대회 선택 목록에 나온다. */
export const openContest = (id: string, title: string) => ({
  __typename: 'GroupContest' as const,
  likeLimit: 1,
  id,
  groupId: 'gallery',
  title,
  startsAt: '2026-11-01T00:00:00.000Z',
  submissionEndsAt: '2026-11-20T00:00:00.000Z',
  endsAt: '2026-11-25T00:00:00.000Z',
  phase: Phase.Submission,
  isAdmin: false,
  canParticipate: true,
  canVote: false,
  votedPostId: null,
  entryCount: 0,
  winners: [],
});

/** 서버처럼 다음 틱에 응답한다. */
const respond = (data: Record<string, unknown>) =>
  new Observable<ApolloLink.Result>((sink) => {
    queueMicrotask(() => {
      sink.next({ data });
      sink.complete();
    });
  });

/**
 * 접수 중인 대회 목록의 첫 페이지를 주고 보낸 게시 요청의 변수를 모은다. 다른 화면으로 갔다 돌아올 때
 * 글쓰기를 감췄다 다시 보여 주는 경우를 재현하도록 Activity 안에 그리고, show로 모드를 바꾼다.
 */
export async function renderContestForm({
  defaultContestId,
  contests,
  nextOffset = null,
}: {
  defaultContestId?: string;
  contests: ReturnType<typeof openContest>[];
  nextOffset?: number | null;
}) {
  const posts: Record<string, unknown>[] = [];
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) => {
      if (operation.operationName === 'GroupContests')
        return respond({
          groupContestsPage: { __typename: 'GroupContestPage', nextOffset, items: contests },
        });
      if (operation.operationName === 'PostCategoryOptions')
        return respond({ group: { __typename: 'Group', id: 'gallery', categories: [] } });
      if (operation.operationName === 'CreatePost') posts.push(operation.variables);
      return EMPTY;
    }),
  });
  const page = (mode: 'visible' | 'hidden') => (
    <ApolloProvider client={client}>
      <Activity mode={mode}>
        <CreatePostForm groupId="gallery" defaultContestId={defaultContestId} onCreated={() => {}} />
      </Activity>
    </ApolloProvider>
  );
  const view = await act(async () => render(page('visible')));
  return { user: userEvent.setup(), posts, show: (mode: 'visible' | 'hidden') => view.rerender(page(mode)) };
}

/** 파일 없이 링크만 붙여 게시한다. */
export async function submitLinkPost(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.type(screen.getByLabelText('제목', { exact: false }), title);
  await user.type(screen.getByLabelText('첨부 링크', { exact: false }), 'https://example.com/entry');
  await user.click(screen.getByRole('checkbox', { name: /공유할 권리/ }));
  await user.click(screen.getByRole('button', { name: '게시물 올리기' }));
}
