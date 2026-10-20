import { Injectable } from '@nestjs/common';
import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import { recordEvent } from '../analytics/analytics-event.writer';
import type { IViewer } from '../auth/session.service';
import { ERROR_CODE, fail } from '../common/errors';
import { Database } from '../database/database.service';
import { GroupCategoryService } from '../group/group-category.service';
import { MembershipService } from '../group/membership.service';
import { presentPost } from './post.presenter';
import { postInclude } from './post.query';

@Injectable()
export class PostCategoryService {
  constructor(
    private readonly db: Database,
    private readonly membership: MembershipService,
    private readonly categories: GroupCategoryService,
  ) {}
  async set(viewer: IViewer, postId: string, categoryId: string | null) {
    await this.db.atomic(async (tx) => {
      const { post, admin } = await this.membership.accessiblePost(viewer.id, postId, tx);
      if (!admin && post.authorId !== viewer.id)
        fail('작성자와 그룹 관리자만 변경할 수 있어요.', ERROR_CODE.FORBIDDEN);
      if (categoryId) await this.categories.requireActive(post.groupId, categoryId, tx);
      await tx.post.update({ where: { id: postId }, data: { categoryId } });
      await recordEvent(tx, {
        id: `post-category:${postId}:${categoryId ?? 'none'}`,
        type: ANALYTICS_EVENT.POST_CATEGORY_CHANGED,
        userId: viewer.id,
        properties: { postId, groupId: post.groupId, categoryId },
      });
    });
    return presentPost(
      await this.db.post.findUniqueOrThrow({ where: { id: postId }, include: postInclude(viewer.id) }),
      viewer.id,
    );
  }
}
