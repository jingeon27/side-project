import type { Prisma } from '../../generated/prisma';

export function postInclude(viewerId: string | null) {
  const userId = { in: viewerId ? [viewerId] : [] };
  return {
    group: { select: { name: true, members: { where: { userId }, select: { role: true } } } },
    author: true,
    upload: true,
    _count: { select: { likes: true, comments: true } },
    likes: { where: { userId }, select: { userId: true } },
  } satisfies Prisma.PostInclude;
}
export type TPostRow = Prisma.PostGetPayload<{ include: ReturnType<typeof postInclude> }>;
