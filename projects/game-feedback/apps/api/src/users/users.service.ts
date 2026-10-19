import { UsersRepository } from './users.repository';
import { Inject, Injectable } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
import { ApiError } from '../common/http/api-error';
import { ACTIVE_CONTENT, ACTIVE_POST } from '../common/content';
import { UserVisibilityService } from './user-visibility.service';
import { authorDto, authorSelect } from './user.presenter';

@Injectable()
export class UsersService {
  constructor(
    @Inject(UsersRepository) private readonly repository: UsersRepository,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
  ) {}
  async profile(req: SessionRequest, id: string) {
    const excluded = await this.visibility.excluded(req);
    const user = await this.repository.findFirstUser({
      where: { id, NOT: { id: { in: excluded } } },
      select: { ...authorSelect, createdAt: true },
    });
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
    const postVisibility = { ...ACTIVE_POST, authorId: { notIn: excluded } };
    const answerVisibility = { authorId: id, ...ACTIVE_CONTENT, post: postVisibility };
    const [postCount, answerCount, helpfulCount] = await Promise.all([
      this.repository.countPost({ where: { ...postVisibility, authorId: id } }),
      this.repository.countAnswer({ where: answerVisibility }),
      this.repository.countAnswer({ where: { ...answerVisibility, helpful: true } }),
    ]);
    return {
      author: authorDto(user),
      joinedAt: user.createdAt.toISOString(),
      postCount,
      answerCount,
      helpfulCount,
    };
  }
}
