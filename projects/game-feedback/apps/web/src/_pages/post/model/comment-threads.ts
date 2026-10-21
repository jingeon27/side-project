import { groupBy } from 'es-toolkit';
import type { Comment } from '@/shared/api';

export interface ICommentThread {
  comment: Comment;
  replies: Comment[];
}

export function commentThreads(comments: Comment[]): ICommentThread[] {
  const replies = groupBy(
    comments.filter((comment) => comment.parentId !== null),
    (comment) => comment.parentId ?? '',
  );
  return comments
    .filter((comment) => comment.parentId === null)
    .map((comment) => ({ comment, replies: replies[comment.id] ?? [] }));
}
