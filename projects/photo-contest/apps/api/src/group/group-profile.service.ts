import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { FileUpload } from 'graphql-upload/processRequest.mjs';

import { recordEvent } from '../analytics/analytics-event.writer';
import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import type { IViewer } from '../auth/session.service';
import { ERROR_CODE, fail } from '../common/errors';
import { readUpload } from '../common/graphql/read-upload';
import { textValue } from '../common/validation';
import {
  GROUP_AVATAR_EDGE_PX,
  GROUP_DESCRIPTION_LIMIT,
  MAX_UPLOAD_BYTES,
  TEXT_LIMIT,
  UPLOAD_TICKET_TTL_MS,
} from '../config/limits';
import { Database } from '../database/database.service';
import { createMediaKey, MediaStorage } from '../storage/media-storage.service';
import { processPhoto } from '../submission/photo-processor';
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
        const avatar = await tx.groupAvatar.findUnique({ where: { id: input.avatarId } });
        if (!avatar || avatar.groupId !== input.groupId || avatar.expiresAt <= new Date())
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
    return this.storage.stream(group.avatar.storageKey);
  }

  async upload(viewer: IViewer, groupId: string, file: Promise<FileUpload>) {
    await this.membership.requireAdmin(viewer.id, groupId);
    const { body } = await readUpload(file, MAX_UPLOAD_BYTES);
    const processed = await processPhoto(body, GROUP_AVATAR_EDGE_PX);
    // 저장 전에 정리 대상을 기록해 저장 실패·권한 회수·응답 중단 뒤에도 파일이 남지 않게 한다.
    const asset = await this.db.groupAvatar.create({
      data: {
        groupId,
        storageKey: createMediaKey('webp'),
        expiresAt: new Date(Date.now() + UPLOAD_TICKET_TTL_MS),
      },
    });
    await this.storage.put(asset.storageKey, processed, 'image/webp');
    return { id: asset.id };
  }
}
