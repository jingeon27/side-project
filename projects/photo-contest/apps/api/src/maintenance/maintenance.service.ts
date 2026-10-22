import { Injectable } from '@nestjs/common';

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
    await this.removeAbandonedUploads(now);
    const avatars = await this.db.groupAvatar.findMany({
      where: {
        expiresAt: { lt: new Date(now.getTime() - UPLOAD_TICKET_TTL_MS) },
        currentGroups: { none: {} },
      },
      take: CLEANUP_BATCH_SIZE,
    });
    for (const avatar of avatars) {
      await this.attempt(async () => {
        await this.media.delete(avatar.storageKey);
        await this.db.groupAvatar.deleteMany({ where: { id: avatar.id, currentGroups: { none: {} } } });
      });
    }
    // 완료하지 않은 티켓의 최종 키다. POST 정책도 같은 시각에 끝나므로 지운 뒤 다시 쓰이지 않는다.
    const staged = await this.db.postUpload.findMany({
      where: { stagingKey: { not: null }, expiresAt: { lt: now } },
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
    const abandoned = await this.db.postUpload.findMany({
      where: {
        expiresAt: { lt: new Date(now.getTime() - UPLOAD_TICKET_TTL_MS) },
        post: null,
        submissionUpload: null,
        groupAvatar: null,
      },
      take: CLEANUP_BATCH_SIZE,
    });
    for (const upload of abandoned) {
      await this.attempt(async () => {
        if (upload.storageKey) await this.media.delete(upload.storageKey);
        if (upload.stagingKey) await this.media.delete(upload.stagingKey);
        await this.db.postUpload.deleteMany({
          where: { id: upload.id, post: null, submissionUpload: null, groupAvatar: null },
        });
      });
    }
    await this.db.authAttempt.deleteMany({ where: { expiresAt: { lte: now } } });
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
