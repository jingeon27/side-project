import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma';
import { CLEANUP_BATCH_SIZE, UPLOAD_TICKET_TTL_MS } from '../config/limits';
import { Database } from '../database/database.service';
import { reportUnexpectedError } from '../monitoring/sentry';
import { MediaStorage } from '../storage/media-storage.service';

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly db: Database,
    private readonly media: MediaStorage,
  ) {}

  async cleanup(now = new Date()) {
    // 만료 직전에 시작한 완료 확정과 겹치지 않도록 모든 업로드 정리는 만료 뒤 유예 시간이 지나야 한다.
    const cutoff = new Date(now.getTime() - UPLOAD_TICKET_TTL_MS);
    // 저장소는 POST 정책이 끝날 때까지 같은 키에 다시 쓰기를 받으므로 그 뒤에 지워야 다시 올린 파일까지 정리된다.
    const policyClosed = [
      { policyExpiresAt: null },
      { policyExpiresAt: { lt: cutoff } },
    ] satisfies Prisma.PostUploadWhereInput[];
    await this.removeAbandonedUploads(now);
    const profiles = await this.db.profileUpload.findMany({
      where: { expiresAt: { lt: cutoff }, policyExpiresAt: { lt: cutoff }, currentUsers: { none: {} } },
      take: CLEANUP_BATCH_SIZE,
    });
    for (const profile of profiles) {
      await this.attempt(async () => {
        await this.media.delete(profile.storageKey);
        await this.db.profileUpload.deleteMany({ where: { id: profile.id, currentUsers: { none: {} } } });
      });
    }
    const avatars = await this.db.groupAvatar.findMany({
      where: { expiresAt: { lt: cutoff }, currentGroups: { none: {} }, coverGroups: { none: {} } },
      take: CLEANUP_BATCH_SIZE,
    });
    for (const avatar of avatars) {
      await this.attempt(async () => {
        await this.media.delete(avatar.storageKey);
        await this.db.groupAvatar.deleteMany({
          where: { id: avatar.id, currentGroups: { none: {} }, coverGroups: { none: {} } },
        });
      });
    }
    // 완료하지 않은 티켓의 최종 키다.
    const staged = await this.db.postUpload.findMany({
      where: { stagingKey: { not: null }, expiresAt: { lt: cutoff }, OR: policyClosed },
      take: CLEANUP_BATCH_SIZE,
    });
    for (const upload of staged) {
      await this.attempt(async () => {
        if (upload.stagingKey) await this.media.delete(upload.stagingKey);
        await this.db.postUpload.updateMany({
          where: { id: upload.id, stagingKey: upload.stagingKey },
          data: { stagingKey: null },
        });
      });
    }
    // 쓰지 않은 완료 파일과 게시물을 지운 업로드
    const unused = {
      expiresAt: { lt: cutoff },
      OR: policyClosed,
      post: null,
      submissionUpload: null,
      groupAvatar: null,
    } satisfies Prisma.PostUploadWhereInput;
    const abandoned = await this.db.postUpload.findMany({ where: unused, take: CLEANUP_BATCH_SIZE });
    for (const upload of abandoned) {
      await this.attempt(async () => {
        if (upload.storageKey) await this.media.delete(upload.storageKey);
        if (upload.stagingKey) await this.media.delete(upload.stagingKey);
        await this.db.postUpload.deleteMany({ where: { id: upload.id, ...unused } });
      });
    }
    await this.db.authAttempt.deleteMany({ where: { expiresAt: { lte: now } } });
    await this.db.rateLimitBucket.deleteMany({ where: { expiresAt: { lte: now } } });
    await this.db.session.deleteMany({ where: { expiresAt: { lt: now } } });
    await this.db.oAuthAttempt.deleteMany({ where: { expiresAt: { lt: now } } });
    await this.db.appLoginTicket.deleteMany({ where: { expiresAt: { lt: now } } });
  }
  private async attempt(work: () => Promise<void>) {
    try {
      await work();
    } catch (error) {
      reportUnexpectedError(error, { operationName: 'cleanup', location: 'upload-cleanup' });
    }
  }
  private async removeAbandonedUploads(now: Date) {
    const abandoned = await this.db.upload.findMany({
      where: { expiresAt: { lt: new Date(now.getTime() - UPLOAD_TICKET_TTL_MS) }, submission: null },
      select: { id: true, imageKey: true },
      take: CLEANUP_BATCH_SIZE,
    });
    for (const upload of abandoned) {
      await this.attempt(async () => {
        if (upload.imageKey) await this.media.delete(upload.imageKey);
        await this.db.upload.deleteMany({ where: { id: upload.id, submission: null } });
      });
    }
  }
}
