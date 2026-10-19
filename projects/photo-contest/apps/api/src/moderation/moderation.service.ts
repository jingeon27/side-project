import { UnitOfWork } from '../database/unit-of-work';
import { ModerationRepository } from './moderation.repository';
import { Injectable } from '@nestjs/common';

import type { IViewer } from '../auth/session.service';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { textValue } from '../common/validation';
import { TEXT_LIMIT } from '../config/limits';
import { MembershipService } from '../group/membership.service';
import { PhotoStorage } from '../storage/photo-storage.service';

@Injectable()
export class ModerationService {
  constructor(
    private readonly repository: ModerationRepository,
    private readonly transactions: UnitOfWork,
    private readonly membership: MembershipService,
    private readonly storage: PhotoStorage,
  ) {}

  /** 그룹 멤버 누구나. 같은 사람의 신고는 처음 한 건만 남는다. 숨긴 사진은 NOT_FOUND */
  async report(viewer: IViewer, submissionId: string, reason: unknown): Promise<boolean> {
    const { submission } = await this.membership.accessibleSubmission(viewer.id, submissionId);
    if (submission.hidden) fail(ERROR_MESSAGE.SUBMISSION_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    const validReason = textValue(reason, TEXT_LIMIT.REPORT_REASON, '신고 이유');
    await this.repository.createManyReport({
      data: [{ submissionId, reporterId: viewer.id, reason: validReason }],
      skipDuplicates: true,
    });
    return true;
  }

  /** 관리자만. 사진·투표·좋아요·신고를 보존한 채 목록·결과에서 뺀다. */
  async hide(viewer: IViewer, submissionId: string): Promise<boolean> {
    await this.membership.accessibleSubmission(viewer.id, submissionId, { owner: true });
    const updated = await this.repository.updateManySubmission({
      where: { id: submissionId },
      data: { hidden: true },
    });
    if (updated.count !== 1) fail(ERROR_MESSAGE.SUBMISSION_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    return true;
  }

  /** 관리자만. 투표·좋아요·신고는 cascade로 지우고, 커밋한 뒤 파일을 지운다. */
  async remove(viewer: IViewer, submissionId: string): Promise<boolean> {
    const imageKey = await this.transactions.atomic(async (tx) => {
      const { submission } = await this.membership.accessibleSubmission(viewer.id, submissionId, {
        owner: true,
        client: tx,
      });
      const upload = await this.repository.findUniqueUpload(
        {
          where: { id: submission.uploadId },
          select: { imageKey: true },
        },
        tx,
      );
      await this.repository.deleteSubmission({ where: { id: submission.id } }, tx);
      // 업로드 행은 정리 작업이 지우도록 만료시켜 둔다.
      await this.repository.updateUpload(
        { where: { id: submission.uploadId }, data: { expiresAt: new Date() } },
        tx,
      );
      return upload?.imageKey ?? null;
    });
    if (imageKey) await this.storage.delete(imageKey);
    return true;
  }
}
