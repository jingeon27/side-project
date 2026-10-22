import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import { recordEvent } from '../analytics/analytics-event.writer';
import type { IViewer } from '../auth/session.service';
import { ERROR_CODE, fail } from '../common/errors';
import { textValue } from '../common/validation';
import { GROUP_DESCRIPTION_LIMIT, TEXT_LIMIT } from '../config/limits';
import { Database } from '../database/database.service';
import { MediaUploadService } from '../media-upload/media-upload.service';
import { MediaStorage } from '../storage/media-storage.service';
import { GroupService } from './group.service';
import { MembershipService } from './membership.service';

interface IGroupProfileInput {
  groupId: string;
  name: string;
  description: string;
  avatarId?: string | null;
  removeAvatar?: boolean;
}

@Injectable()
export class GroupProfileService {
  constructor(
    private readonly db: Database,
    private readonly groups: GroupService,
    private readonly membership: MembershipService,
    private readonly storage: MediaStorage,
    private readonly uploads: MediaUploadService,
  ) {}

  async update(viewer: IViewer, input: IGroupProfileInput) {
    const name = textValue(input.name, TEXT_LIMIT.GROUP_NAME, '그룹 이름');
    const description = input.description.trim();
    if (description.length > GROUP_DESCRIPTION_LIMIT) fail('그룹 소개는 500자 이하로 입력해 주세요.');
    if (input.avatarId != null && input.removeAvatar) fail('사진 선택과 삭제 중 하나만 골라 주세요.');
    await this.membership.requireAdmin(viewer.id, input.groupId);
    await this.db.atomic(async (tx) => {
      await this.membership.requireAdmin(viewer.id, input.groupId, tx);
      if (input.avatarId != null) {
        const avatar = await tx.groupAvatar.findUnique({
          where: { id: input.avatarId },
          include: { mediaUpload: true },
        });
        if (
          !avatar ||
          avatar.groupId !== input.groupId ||
          avatar.expiresAt <= new Date() ||
          (avatar.mediaUploadId && avatar.mediaUpload?.storageKey !== avatar.storageKey)
        )
          fail('그룹 사진 업로드가 만료되었거나 사용할 수 없습니다.');
      }
      await tx.group.update({
        where: { id: input.groupId },
        data: {
          name,
          description,
          ...(input.removeAvatar ? { avatarId: null } : {}),
          ...(input.avatarId != null ? { avatarId: input.avatarId } : {}),
        },
      });
      await recordEvent(tx, {
        id: `group-profile:${randomUUID()}`,
        type: ANALYTICS_EVENT.GROUP_PROFILE_UPDATED,
        userId: viewer.id,
        properties: { groupId: input.groupId },
      });
    });
    return this.groups.group(viewer, input.groupId);
  }

  async file(groupId: string, avatarId: string) {
    const group = await this.db.group.findUnique({ where: { id: groupId }, include: { avatar: true } });
    if (!group?.avatar || group.avatarId !== avatarId)
      fail('그룹 사진을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
    return { key: group.avatar.storageKey, file: await this.storage.stream(group.avatar.storageKey) };
  }

  requestUpload(viewer: IViewer, groupId: string, contentType: string, byteSize: number) {
    return this.uploads.requestUpload(viewer, groupId, contentType, byteSize, { kind: 'GROUP_AVATAR' });
  }

  async completeUpload(viewer: IViewer, avatarId: string) {
    const avatar = await this.db.groupAvatar.findUnique({ where: { id: avatarId } });
    if (!avatar?.mediaUploadId) fail('그룹 사진 업로드가 만료되었거나 사용할 수 없습니다.');
    await this.uploads.completeUpload(viewer, avatar.mediaUploadId, { avatarId });
    return { id: avatarId };
  }
}
