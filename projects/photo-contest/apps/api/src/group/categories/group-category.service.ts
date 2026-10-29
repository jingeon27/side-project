import { Injectable } from '@nestjs/common';
import { groupBy, mapValues } from 'es-toolkit';

import { Prisma, type GroupCategory } from '../../../generated/prisma';
import { ANALYTICS_EVENT } from '../../analytics/analytics-event';
import { recordEvent } from '../../analytics/analytics-event.writer';
import type { IViewer } from '../../auth/session/session.service';
import { ERROR_CODE, fail } from '../../common/errors';
import { textValue } from '../../common/validation';
import { GROUP_CATEGORY_LIMIT, GROUP_CATEGORY_NAME_LIMIT } from '../../config/limits';
import { Database, type TDatabaseClient } from '../../database/database.service';
import { MembershipService } from '../membership/membership.service';

@Injectable()
export class GroupCategoryService {
  constructor(
    private readonly db: Database,
    private readonly membership: MembershipService,
  ) {}

  /** 여러 그룹의 활성 카테고리를 한 번에 읽는다. 권한은 호출하는 쪽(Group 노드의 canViewPosts)이 확인한다. */
  async activeOf(groupIds: readonly string[]): Promise<Map<string, GroupCategory[]>> {
    const rows = await this.db.groupCategory.findMany({
      where: { groupId: { in: [...groupIds] }, archivedAt: null },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    const byGroup = mapValues(
      groupBy(rows, (row) => row.groupId),
      (categories) => categories.slice(0, GROUP_CATEGORY_LIMIT),
    );
    return new Map(Object.entries(byGroup));
  }
  async requireActive(groupId: string, categoryId: string, client: TDatabaseClient) {
    const category = await client.groupCategory.findFirst({
      where: { id: categoryId, groupId, archivedAt: null },
    });
    if (!category) fail('사용할 수 없는 카테고리예요.', ERROR_CODE.BAD_USER_INPUT);
    return category;
  }
  private async editable(viewer: IViewer, categoryId: string, tx: TDatabaseClient) {
    const category = await tx.groupCategory.findUnique({ where: { id: categoryId } });
    if (!category) fail('카테고리를 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
    await this.membership.requireAdmin(viewer.id, category.groupId, tx);
    return category;
  }
  private async uniqueName<T>(write: () => Promise<T>) {
    try {
      return await write();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        fail('이미 있는 카테고리예요.', ERROR_CODE.CONFLICT);
      throw error;
    }
  }
  async create(viewer: IViewer, groupId: string, value: string) {
    const name = textValue(value, GROUP_CATEGORY_NAME_LIMIT, '카테고리 이름');
    return this.db.atomic(async (tx) => {
      await this.membership.requireAdmin(viewer.id, groupId, tx);
      const count = await tx.groupCategory.count({ where: { groupId, archivedAt: null } });
      if (count >= GROUP_CATEGORY_LIMIT) fail('카테고리는 최대 20개까지 만들 수 있어요.');
      const last = await tx.groupCategory.findFirst({
        where: { groupId, archivedAt: null },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const created = await this.uniqueName(() =>
        tx.groupCategory.create({
          data: { groupId, name, position: (last?.position ?? -1) + 1, createdById: viewer.id },
        }),
      );
      await recordEvent(tx, {
        id: `category:${created.id}`,
        type: ANALYTICS_EVENT.GROUP_CATEGORY_CREATED,
        userId: viewer.id,
        properties: { groupId, categoryId: created.id },
      });
      return created;
    });
  }
  async rename(viewer: IViewer, categoryId: string, value: string) {
    const name = textValue(value, GROUP_CATEGORY_NAME_LIMIT, '카테고리 이름');
    return this.db.atomic(async (tx) => {
      const category = await this.editable(viewer, categoryId, tx);
      if (category.archivedAt) fail('보관된 카테고리는 변경할 수 없어요.', ERROR_CODE.NOT_FOUND);
      return this.uniqueName(() => tx.groupCategory.update({ where: { id: categoryId }, data: { name } }));
    });
  }
  async archive(viewer: IViewer, categoryId: string) {
    return this.db.atomic(async (tx) => {
      const category = await this.editable(viewer, categoryId, tx);
      if (category.archivedAt) return category;
      return tx.groupCategory.update({ where: { id: categoryId }, data: { archivedAt: new Date() } });
    });
  }
  async reorder(viewer: IViewer, groupId: string, categoryIds: string[]) {
    if (categoryIds.length > GROUP_CATEGORY_LIMIT || new Set(categoryIds).size !== categoryIds.length)
      fail('카테고리 순서를 다시 확인해 주세요.');
    return this.db.atomic(async (tx) => {
      await this.membership.requireAdmin(viewer.id, groupId, tx);
      const active = await tx.groupCategory.findMany({
        where: { groupId, archivedAt: null },
        select: { id: true },
        take: GROUP_CATEGORY_LIMIT,
      });
      if (
        active.length !== categoryIds.length ||
        active.some((category) => !categoryIds.includes(category.id))
      )
        fail('카테고리 순서를 다시 확인해 주세요.');
      return Promise.all(
        categoryIds.map((id, position) => tx.groupCategory.update({ where: { id }, data: { position } })),
      );
    });
  }
}
