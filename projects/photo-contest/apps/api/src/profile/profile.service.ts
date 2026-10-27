import { Injectable } from '@nestjs/common';

import type { IViewer } from '../auth/session.service';
import { USER_VIEW_SELECT } from '../auth/user-view';
import { ERROR_CODE, fail } from '../common/errors';
import { COMPLETED_POST_UPLOAD_TTL_MS, MAX_PENDING_UPLOADS, UPLOAD_TICKET_TTL_MS } from '../config/limits';
import { Database } from '../database/database.service';
import { assertStorageQuota } from '../media-upload/storage-quota';
import { createMediaKey, MediaStorage } from '../storage/media-storage.service';
import { type TRequestProfileAvatarUploadDto, type TUpdateMyProfileDto } from './profile.dto';

const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
const REJECTED = '프로필 사진 업로드가 만료되었거나 사용할 수 없습니다.';

@Injectable()
export class ProfileService {
  constructor(
    private readonly db: Database,
    private readonly storage: MediaStorage,
  ) {}

  async requestUpload(viewer: IViewer, input: TRequestProfileAvatarUploadDto) {
    const extension = EXTENSION[input.contentType];
    if (!extension) fail('JPEG·PNG·WebP 사진을 선택해 주세요.');
    const upload = await this.db.atomic(async (tx) => {
      const now = new Date();
      const pending = await tx.profileUpload.count({
        where: { userId: viewer.id, expiresAt: { gt: now }, currentUsers: { none: {} } },
      });
      if (pending >= MAX_PENDING_UPLOADS)
        fail('업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', ERROR_CODE.RATE_LIMITED);
      await assertStorageQuota(tx, viewer, input.byteSize);
      const expiresAt = new Date(now.getTime() + UPLOAD_TICKET_TTL_MS);
      return tx.profileUpload.create({
        data: {
          userId: viewer.id,
          storageKey: createMediaKey(extension),
          contentType: input.contentType,
          byteSize: input.byteSize,
          expiresAt,
          policyExpiresAt: expiresAt,
        },
      });
    });
    const form = await this.storage.presignUpload(
      upload.storageKey,
      upload.contentType,
      upload.byteSize,
      upload.expiresAt,
    );
    return {
      id: upload.id,
      expiresAt: upload.expiresAt,
      url: form.url,
      fields: Object.entries(form.fields).map(([name, value]) => ({ name, value })),
    };
  }

  async completeUpload(viewer: IViewer, uploadId: string) {
    const upload = await this.db.profileUpload.findUnique({ where: { id: uploadId } });
    if (!upload || upload.userId !== viewer.id || upload.expiresAt <= new Date())
      fail(REJECTED, ERROR_CODE.FORBIDDEN);
    if (upload.completedAt) return { id: upload.id };
    const actual = await this.storage
      .head(upload.storageKey)
      .catch(() => fail('파일 전송을 완료한 뒤 다시 시도해 주세요.'));
    if (actual.byteSize !== upload.byteSize || actual.contentType !== upload.contentType)
      fail('업로드한 파일의 크기와 형식을 확인해 주세요.');
    const now = new Date();
    const completed = await this.db.profileUpload.updateMany({
      where: { id: uploadId, userId: viewer.id, expiresAt: { gt: now }, completedAt: null },
      data: { completedAt: now, expiresAt: new Date(now.getTime() + COMPLETED_POST_UPLOAD_TTL_MS) },
    });
    if (!completed.count) {
      const current = await this.db.profileUpload.findUnique({ where: { id: uploadId } });
      if (!current?.completedAt || current.expiresAt <= now) fail(REJECTED, ERROR_CODE.FORBIDDEN);
    }
    return { id: uploadId };
  }

  update(viewer: IViewer, input: TUpdateMyProfileDto, completeOnboarding = false) {
    if (input.avatarId && input.removeAvatar) fail('사진 선택과 삭제 중 하나만 골라 주세요.');
    return this.db.atomic(async (tx) => {
      if (input.avatarId) {
        const upload = await tx.profileUpload.findUnique({ where: { id: input.avatarId } });
        if (!upload || upload.userId !== viewer.id || !upload.completedAt || upload.expiresAt <= new Date())
          fail(REJECTED, ERROR_CODE.FORBIDDEN);
      }
      return tx.user.update({
        where: { id: viewer.id },
        data: {
          nickname: input.nickname,
          ...(completeOnboarding
            ? { needsOnboarding: false, termsAcceptedAt: new Date(), termsVersion: '2026-10-22' }
            : {}),
          ...(input.removeAvatar ? { avatarUploadId: null, avatar: null } : {}),
          ...(input.avatarId ? { avatarUploadId: input.avatarId, avatar: null } : {}),
        },
        select: USER_VIEW_SELECT,
      });
    });
  }

  // 프로필은 게시물 작성자 등 공개 사용자 정보에 표시한다. 현재 선택된 파일만 서명한다.
  async avatarKey(userId: string, avatarId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId }, include: { avatarUpload: true } });
    if (!user?.avatarUpload || user.avatarUploadId !== avatarId || !user.avatarUpload.completedAt)
      fail('프로필 사진을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
    return user.avatarUpload.storageKey;
  }
}
