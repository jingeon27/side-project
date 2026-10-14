import { Injectable } from '@nestjs/common';

import { CLEANUP_BATCH_SIZE, UPLOAD_TICKET_TTL_MS } from '../config/limits';
import { Database } from '../database/database.service';
import { PhotoStorage } from '../storage/photo-storage.service';

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly db: Database,
    private readonly storage: PhotoStorage,
  ) {}

  /** 버려진 업로드 파일과 만료된 세션·OAuth 시도·앱 로그인 티켓을 지운다. */
  async cleanup(now = new Date()) {
    await this.removeAbandonedUploads(now);
    await this.db.session.deleteMany({ where: { expiresAt: { lt: now } } });
    await this.db.oAuthAttempt.deleteMany({ where: { expiresAt: { lt: now } } });
    await this.db.appLoginTicket.deleteMany({ where: { expiresAt: { lt: now } } });
  }

  private async removeAbandonedUploads(now: Date) {
    // 티켓 만료 직후 제출과 겹치지 않도록 만료 후 한 번 더 기다린 업로드만 지운다.
    const abandoned = await this.db.upload.findMany({
      where: { expiresAt: { lt: new Date(now.getTime() - UPLOAD_TICKET_TTL_MS) }, submission: null },
      select: { id: true, imageKey: true },
      take: CLEANUP_BATCH_SIZE,
    });
    for (const upload of abandoned) {
      if (upload.imageKey) await this.storage.delete(upload.imageKey);
      await this.db.upload.deleteMany({ where: { id: upload.id, submission: null } });
    }
  }
}
