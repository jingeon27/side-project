import { ACTIVE_CONTENT } from '../common/content';
import type { Prisma } from '../generated/prisma';

/** 삭제된 원댓글은 익명 자리표시자로 남길 수 있지만 차단·숨김 관계는 전파한다. */
export function activeCommentWhere(excluded: string[]) {
  return {
    ...ACTIVE_CONTENT,
    authorId: { notIn: excluded },
    OR: [
      { parentId: null },
      {
        parent: {
          is: {
            hidden: false,
            OR: [{ deletedAt: { not: null } }, { deletedAt: null, authorId: { notIn: excluded } }],
          },
        },
      },
    ],
  } satisfies Prisma.CommentWhereInput;
}
