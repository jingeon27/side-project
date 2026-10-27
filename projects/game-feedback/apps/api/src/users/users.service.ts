import { Inject, Injectable } from '@nestjs/common';

import { ProfileLinksSchema } from '@game-feedback/contracts';

import type { SessionRequest } from '../auth/session.types';
import { ACTIVE_CONTENT, ACTIVE_POST } from '../common/content';
import { ApiError } from '../common/http/api-error';
import { PrismaClient } from '../generated/prisma';
import { UserVisibilityService } from './user-visibility.service';
import { authorDto, authorSelect } from './user.presenter';

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
  ) {}
  async profile(req: SessionRequest, id: string) {
    const excluded = await this.visibility.excluded(req);
    const user = await this.db.user.findFirst({
      where: { id, withdrawnAt: null, adminAccount: { is: null }, NOT: { id: { in: excluded } } },
      select: {
        ...authorSelect,
        createdAt: true,
        profileLinks: true,
        bio: true,
        gameAccounts: { select: { profile: true }, orderBy: { updatedAt: 'desc' } },
      },
    });
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
    const postVisibility = { ...ACTIVE_POST, authorId: { notIn: excluded } };
    const answerVisibility = { authorId: id, ...ACTIVE_CONTENT, post: postVisibility };
    const [postCount, answerCount, helpfulCount] = await Promise.all([
      this.db.post.count({ where: { ...postVisibility, authorId: id } }),
      this.db.answer.count({ where: answerVisibility }),
      this.db.answer.count({ where: { ...answerVisibility, helpful: true } }),
    ]);
    return {
      author: authorDto(user),
      bio: user.bio,
      gameAccounts: user.gameAccounts.map((account) => account.profile),
      links: ProfileLinksSchema.parse(user.profileLinks),
      joinedAt: user.createdAt.toISOString(),
      postCount,
      answerCount,
      helpfulCount,
    };
  }
}
