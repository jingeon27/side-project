import { phase } from '../contest/contest.policy';
import { isAdmin } from '../group/group-role';
import type { TPostRow } from './post.query';

export function presentPost(row: TPostRow, userId: string | null) {
  return {
    id: row.id,
    category: row.category,
    contestId: row.contestId,
    contest: row.contest ? { ...row.contest, phase: phase(row.contest) } : null,
    groupId: row.groupId,
    groupName: row.group.name,
    title: row.title,
    body: row.body,
    author: row.author,
    createdAt: row.createdAt,
    kind: row.upload?.kind ?? 'LINK',
    mediaUrl: row.upload ? `/backend/media/${row.id}` : null,
    linkUrl: row.linkUrl,
    likeCount: row._count.likes,
    commentCount: row._count.comments,
    likedByMe: row.likes.length > 0,
    canDelete: row.authorId === userId || row.group.members.some(isAdmin),
    canModerate: row.group.members.some(isAdmin),
    canInteract: row.group.members.length > 0,
  };
}
