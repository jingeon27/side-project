import { useState } from 'react';

import type { ApolloClient } from '@apollo/client';
import { ApolloProvider, useQuery } from '@apollo/client/react';

import { useCommentForm } from '../../src/features/post/model/comment-form.hook';
import { PostCommentComposer } from '../../src/features/post/ui/comments/composer/PostCommentComposer';
import { PostReplyComposer } from '../../src/features/post/ui/comments/composer/PostReplyComposer';
import { PostCommentsDocument } from '../../src/shared/api/generated';
import { COMMENT_POST } from './comment-composer.data';

function CommentPanel({ parentId }: { parentId: string | null }) {
  const form = useCommentForm();
  const [completedReplies, setCompletedReplies] = useState(0);
  const { data, error, refetch } = useQuery(PostCommentsDocument, {
    variables: { postId: COMMENT_POST.id, parentId, offset: 0, limit: 24 },
  });
  return (
    <>
      {error ? <p role="alert">댓글 목록을 불러오지 못했어요.</p> : null}
      <button
        onClick={async () => {
          try {
            await refetch();
          } catch {
            // 조회 오류는 목록에 남기고 작성 요청은 다시 보내지 않는다.
          }
        }}
      >
        댓글 새로고침
      </button>
      <ul aria-label="댓글 목록">
        {data?.postComments.map((row) => (
          <li key={row.id}>{row.body}</li>
        ))}
      </ul>
      <output aria-label="답글 완료 횟수">{completedReplies}</output>
      {parentId ? (
        <PostReplyComposer
          postId={COMMENT_POST.id}
          parentId={parentId}
          onCancel={() => undefined}
          onCreated={() => setCompletedReplies((count) => count + 1)}
        />
      ) : (
        <PostCommentComposer postId={COMMENT_POST.id} form={form} />
      )}
    </>
  );
}

export function CommentComposerFixture({
  client,
  parentId,
}: {
  client: ApolloClient;
  parentId: string | null;
}) {
  return (
    <ApolloProvider client={client}>
      <CommentPanel parentId={parentId} />
    </ApolloProvider>
  );
}
