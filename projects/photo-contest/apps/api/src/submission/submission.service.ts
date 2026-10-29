import { Injectable } from '@nestjs/common';

import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import { recordEvent } from '../analytics/analytics-event.writer';
import type { IViewer } from '../auth/session/session.service';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { pageRange, textValue } from '../common/validation';
import { PAGE_SIZE_DEFAULT, TEXT_LIMIT } from '../config/limits';
import { phase, PHASE } from '../contest/contest.policy';
import { Database } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';
import { isAdmin } from '../group/membership/group-role';
import { MembershipService, type ISubmissionAccess } from '../group/membership/membership.service';
import { MediaUploadService } from '../media-upload/media-upload.service';
import { submissionOrderBy, toSubmissionSort } from './submission-sort';
import { presentSubmission, submissionInclude, type ISubmissionView } from './submission.presenter';

export interface ISubmissionListQuery {
  offset?: unknown;
  limit?: unknown;
  sort?: unknown;
}

export interface ICreateSubmissionInput {
  contestId: string;
  uploadId: string;
  caption: unknown;
  rightsConfirmed: unknown;
}

const MESSAGE = {
  RIGHTS_REQUIRED: '사진 사용 권리와 촬영된 사람의 동의를 확인해 주세요.',
  UPLOAD_INCOMPLETE: '사진 업로드가 완료되지 않았거나 만료되었습니다.',
  UPLOAD_REJECTED: '업로드 요청이 만료되었거나 유효하지 않습니다.',
} as const satisfies Record<string, string>;

@Injectable()
export class SubmissionService {
  constructor(
    private readonly db: Database,
    private readonly transactions: UnitOfWork,
    private readonly membership: MembershipService,
    private readonly uploads: MediaUploadService,
  ) {}

  /** 관리자가 아니면 숨긴 사진을 뺀다. 인자가 null이면 스키마 기본값과 같게 본다. */
  async list(viewer: IViewer, contestId: string, query: ISubmissionListQuery): Promise<ISubmissionView[]> {
    const { offset, limit } = pageRange(query.offset ?? 0, query.limit ?? PAGE_SIZE_DEFAULT);
    const sort = toSubmissionSort(query.sort);
    const { contest, member } = await this.membership.accessibleContest(viewer.id, contestId);
    const admin = isAdmin(member);
    const rows = await this.db.submission.findMany({
      where: { contestId, ...(admin ? {} : { hidden: false }) },
      include: submissionInclude(viewer.id, admin),
      orderBy: submissionOrderBy(sort),
      skip: offset,
      take: limit,
    });
    const completed = phase(contest) === PHASE.COMPLETED;
    return rows.map((row) => presentSubmission(row, { completed, admin }));
  }

  /** 접근을 확인한 사진 하나를 조회자 기준으로 다시 읽는다. 좋아요처럼 사진을 바꾼 뒤 돌려줄 때 쓴다. */
  async view(viewer: IViewer, { submission, contest, admin }: ISubmissionAccess): Promise<ISubmissionView> {
    const row = await this.db.submission.findUnique({
      where: { id: submission.id },
      include: submissionInclude(viewer.id, admin),
    });
    if (!row) fail(ERROR_MESSAGE.SUBMISSION_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    return presentSubmission(row, { completed: phase(contest) === PHASE.COMPLETED, admin });
  }

  async requestUploadUrl(
    viewer: IViewer,
    contestId: string,
    contentType: string,
    byteSize: number,
    address: string | null = null,
  ) {
    const { contest } = await this.membership.accessibleContest(viewer.id, contestId);
    if (phase(contest) !== PHASE.SUBMISSION) fail(ERROR_MESSAGE.NOT_SUBMISSION_PHASE);
    return this.uploads.requestUpload(
      viewer,
      contest.groupId,
      contentType,
      byteSize,
      { kind: 'SUBMISSION', contestId },
      address,
    );
  }

  async completeUpload(viewer: IViewer, uploadId: string) {
    const grant = await this.db.upload.findUnique({ where: { id: uploadId } });
    if (!grant || grant.userId !== viewer.id || !grant.mediaUploadId)
      fail(MESSAGE.UPLOAD_REJECTED, ERROR_CODE.FORBIDDEN);
    await this.uploads.completeUpload(viewer, grant.mediaUploadId, { submissionId: grant.id });
    return true;
  }

  /** 1인 1장은 (contestId, authorId) unique로 지킨다. 겹치면 CONFLICT */
  async create(viewer: IViewer, input: ICreateSubmissionInput): Promise<ISubmissionView> {
    if (input.rightsConfirmed !== true) fail(MESSAGE.RIGHTS_REQUIRED);
    const caption = textValue(input.caption, TEXT_LIMIT.CAPTION, '사진 설명');
    const { row, admin } = await this.transactions.atomic(async (tx) => {
      const { contest, member } = await this.membership.accessibleContest(viewer.id, input.contestId, {
        client: tx,
      });
      if (phase(contest) !== PHASE.SUBMISSION) fail(ERROR_MESSAGE.NOT_SUBMISSION_PHASE);
      const upload = await (tx ?? this.db).upload.findUnique({ where: { id: input.uploadId } });
      if (
        !upload ||
        upload.userId !== viewer.id ||
        upload.contestId !== contest.id ||
        !upload.imageKey ||
        upload.expiresAt < new Date()
      )
        fail(MESSAGE.UPLOAD_INCOMPLETE);
      const created = await (tx ?? this.db).submission.create({
        data: { authorId: viewer.id, contestId: contest.id, uploadId: upload.id, caption },
        include: submissionInclude(viewer.id, isAdmin(member)),
      });
      // 제출한 사진의 원본 업로드는 제출이 남아 있는 동안 만료가 없다.
      if (upload.mediaUploadId)
        await tx.postUpload.update({ where: { id: upload.mediaUploadId }, data: { expiresAt: null } });
      const properties = { contestId: contest.id, groupId: contest.groupId };
      await recordEvent(tx ?? this.db, {
        id: `submission:${created.id}`,
        type: ANALYTICS_EVENT.SUBMISSION_CREATED,
        userId: viewer.id,
        properties,
      });
      // 같은 그룹의 이전 대회에 참여했던 사람이 다시 참여했는지(재참여율)를 본다.
      const previous = await (tx ?? this.db).submission.findFirst({
        where: {
          authorId: viewer.id,
          contest: { groupId: contest.groupId, endsAt: { lt: contest.startsAt } },
        },
        select: { id: true },
      });
      if (previous)
        await recordEvent(tx ?? this.db, {
          id: `return:${contest.id}:${viewer.id}`,
          type: ANALYTICS_EVENT.NEXT_CONTEST_JOINED,
          userId: viewer.id,
          properties,
        });
      return { row: created, admin: isAdmin(member) };
    });
    return presentSubmission(row, { completed: false, admin });
  }

  /** 비공개 사진 파일의 저장소 키. 매 요청 멤버십을 확인하고, 숨긴 사진은 관리자에게만 준다. */
  async photoKey(viewer: IViewer, submissionId: string): Promise<string> {
    const { submission } = await this.membership.accessibleSubmission(viewer.id, submissionId);
    const upload = await this.db.upload.findUnique({
      where: { id: submission.uploadId },
      select: { imageKey: true },
    });
    if (!upload?.imageKey) fail(ERROR_MESSAGE.SUBMISSION_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    return upload.imageKey;
  }
}
