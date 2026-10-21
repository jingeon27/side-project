import type { Prisma } from '../../generated/prisma';

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
    author: true,
    upload: true,
    _count: { select: { likes: true, comments: true, contestVotes: true } },
    likes: { where: { userId }, select: { userId: true } },
  } satisfies Prisma.PostInclude;
}
export type TPostRow = Prisma.PostGetPayload<{ include: ReturnType<typeof postInclude> }>;
