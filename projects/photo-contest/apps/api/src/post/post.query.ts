import type { Prisma } from '../../generated/prisma';
import { USER_VIEW_SELECT } from '../auth/user-view';

export function postInclude(viewerId: string | null) {
  const userId = { in: viewerId ? [viewerId] : [] };
  return {
    group: { select: { name: true, members: { where: { userId }, select: { role: true } } } },
    contest: {
      select: {
        id: true,
        groupId: true,
        title: true,
        likeLimit: true,
        startsAt: true,
        submissionEndsAt: true,
        endsAt: true,
      },
    },
    category: true,
    author: { select: USER_VIEW_SELECT },
    upload: true,
    _count: { select: { likes: true, comments: true, contestVotes: true } },
    likes: { where: { userId }, select: { userId: true } },
  } satisfies Prisma.PostInclude;
}
export type TPostRow = Prisma.PostGetPayload<{ include: ReturnType<typeof postInclude> }>;
