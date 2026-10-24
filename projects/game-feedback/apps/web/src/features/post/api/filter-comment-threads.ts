import type { Comment } from '@/shared/api';

export function filterCommentThreads(comments: Comment[], excluded: ReadonlySet<string>): Comment[] {
  const roots = new Set(
    comments
      .filter(
        (comment) => comment.parentId === null && (comment.isDeleted || !excluded.has(comment.author.id)),
      )
      .map((comment) => comment.id),
  );
  const replies = comments.filter(
    (comment) =>
      !comment.isDeleted &&
      comment.parentId !== null &&
      roots.has(comment.parentId) &&
      !excluded.has(comment.author.id),
  );
  const replyIds = new Set(replies.map((comment) => comment.id));
  const parentsWithReplies = new Set(replies.map((comment) => comment.parentId));
  return comments.filter((comment) => {
    if (comment.parentId !== null) return replyIds.has(comment.id);
    return roots.has(comment.id) && (!comment.isDeleted || parentsWithReplies.has(comment.id));
  });
}
