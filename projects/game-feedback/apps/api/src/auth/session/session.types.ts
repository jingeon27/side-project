import type { Request } from 'express';

import type { Prisma } from '../../generated/prisma';

export type SessionRequest = Request & {
  gfSession?: Prisma.SessionGetPayload<{
    include: { user: { include: { avatar: { select: { id: true } } } } };
  }> | null;
};
