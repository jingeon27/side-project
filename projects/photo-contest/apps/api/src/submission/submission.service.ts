import { UnitOfWork } from '../database/unit-of-work';
import { SubmissionRepository } from './submission.repository';
import type { FileUpload } from 'graphql-upload/processRequest.mjs';

import type { Prisma } from '../../generated/prisma';

import { Injectable } from '@nestjs/common';

import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import type { IViewer } from '../auth/session.service';
import { readUpload } from '../common/graphql/read-upload';
import { MAX_UPLOAD_BYTES } from '../config/limits';
import { randomToken, sha256Hex } from '../common/crypto';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { pageRange, textValue } from '../common/validation';
import { MAX_PENDING_UPLOADS, PAGE_SIZE_DEFAULT, TEXT_LIMIT, UPLOAD_TICKET_TTL_MS } from '../config/limits';
import { phase, PHASE } from '../contest/contest.policy';
import { isOwner } from '../group/group-role';
import { MembershipService } from '../group/membership.service';
import type { ISubmissionAccess } from '../group/membership.service';
import { createPhotoKey } from '../storage/photo-key';
import { PhotoStorage } from '../storage/photo-storage.service';
import { processPhoto } from './photo-processor';
import { presentSubmission, submissionInclude } from './submission.presenter';
import type { ISubmissionView } from './submission.presenter';
import { submissionOrderBy, toSubmissionSort } from './submission-sort';

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

/** GraphQL UploadTicket. url은 일회용 토큰 원문을 담는다(DB에는 해시만). */
export interface IUploadTicket {
  id: string;
  url: string;
  expiresAt: Date;
}

const MESSAGE = {
  TOO_MANY_UPLOADS: '업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  RIGHTS_REQUIRED: '사진 사용 권리와 촬영된 사람의 동의를 확인해 주세요.',
  UPLOAD_INCOMPLETE: '사진 업로드가 완료되지 않았거나 만료되었습니다.',
  UPLOAD_REJECTED: '업로드 요청이 만료되었거나 유효하지 않습니다.',
  UPLOAD_USED: '이미 사용했거나 만료된 업로드입니다.',
} as const;

/** 웹 origin의 /backend 프록시 경로 */
function uploadUrl(token: string) {
  return `/backend/uploads/${token}`;
}

@Injectable()
export class SubmissionService {
  constructor(
    private readonly repository: SubmissionRepository,
    private readonly transactions: UnitOfWork,
    private readonly membership: MembershipService,
    private readonly storage: PhotoStorage,
  ) {}

  /** 관리자가 아니면 숨긴 사진을 뺀다. 인자가 null이면 스키마 기본값과 같게 본다. */
  async list(viewer: IViewer, contestId: string, query: ISubmissionListQuery): Promise<ISubmissionView[]> {
    const { offset, limit } = pageRange(query.offset ?? 0, query.limit ?? PAGE_SIZE_DEFAULT);
    const sort = toSubmissionSort(query.sort);
    const { contest, member } = await this.membership.accessibleContest(viewer.id, contestId);
    const admin = isOwner(member);
    const rows = await this.repository.findManySubmission({
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
    const row = await this.repository.findUniqueSubmission({
      where: { id: submission.id },
      include: submissionInclude(viewer.id, admin),
    });
    if (!row) fail(ERROR_MESSAGE.SUBMISSION_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    return presentSubmission(row, { completed: phase(contest) === PHASE.COMPLETED, admin });
  }

  /** 제출 기간에만, 사용자·대회마다 대기 중인 티켓은 10개까지 */
  async requestUploadUrl(viewer: IViewer, contestId: string): Promise<IUploadTicket> {
    const { contest } = await this.membership.accessibleContest(viewer.id, contestId);
    if (phase(contest) !== PHASE.SUBMISSION) fail(ERROR_MESSAGE.NOT_SUBMISSION_PHASE);
    const now = new Date();
    const pending = await this.repository.countUpload({
      where: { userId: viewer.id, contestId, expiresAt: { gt: now }, submission: null },
    });
    if (pending >= MAX_PENDING_UPLOADS) fail(MESSAGE.TOO_MANY_UPLOADS, ERROR_CODE.RATE_LIMITED);
    const token = randomToken();
    const upload = await this.repository.createUpload({
      data: {
        userId: viewer.id,
        contestId,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(now.getTime() + UPLOAD_TICKET_TTL_MS),
      },
    });
    return { id: upload.id, url: uploadUrl(token), expiresAt: upload.expiresAt };
  }

  /**
   * 업로드 티켓 원문으로 받은 사진을 변환해 저장한다. 티켓은 한 번만 쓸 수 있다.
   * 티켓 주인이 아니거나 이미 썼거나 만료됐으면 FORBIDDEN.
   */
  async upload(viewer: IViewer, token: string, body: unknown) {
    const grant = await this.uploadGrant(viewer, { tokenHash: sha256Hex(token) });
    await this.saveUpload(grant, body);
  }

  async uploadFile(viewer: IViewer, uploadId: string, file: Promise<FileUpload>) {
    const grant = await this.uploadGrant(viewer, { id: uploadId });
    const content = await readUpload(file, MAX_UPLOAD_BYTES);
    await this.saveUpload(grant, content.body);
    return true;
  }

  private async uploadGrant(viewer: IViewer, where: Prisma.UploadWhereUniqueInput) {
    const grant = await this.repository.findUniqueUpload({ where });
    if (!grant || grant.userId !== viewer.id || grant.imageKey || grant.expiresAt < new Date())
      fail(MESSAGE.UPLOAD_REJECTED, ERROR_CODE.FORBIDDEN);
    const { contest } = await this.membership.accessibleContest(viewer.id, grant.contestId);
    if (phase(contest) !== PHASE.SUBMISSION) fail(ERROR_MESSAGE.NOT_SUBMISSION_PHASE);
    return grant;
  }

  private async saveUpload(grant: Awaited<ReturnType<SubmissionService['uploadGrant']>>, body: unknown) {
    const image = await processPhoto(body);
    const imageKey = createPhotoKey();
    await this.storage.put(imageKey, image);
    try {
      // 같은 티켓으로 동시에 올려도 imageKey를 먼저 기록한 한 요청만 남는다.
      const updated = await this.repository.updateManyUpload({
        where: { id: grant.id, imageKey: null, expiresAt: { gt: new Date() } },
        data: { imageKey },
      });
      if (updated.count !== 1) fail(MESSAGE.UPLOAD_USED);
    } catch (error) {
      await this.storage.delete(imageKey);
      throw error;
    }
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
      const upload = await this.repository.findUniqueUpload({ where: { id: input.uploadId } }, tx);
      if (
        !upload ||
        upload.userId !== viewer.id ||
        upload.contestId !== contest.id ||
        !upload.imageKey ||
        upload.expiresAt < new Date()
      )
        fail(MESSAGE.UPLOAD_INCOMPLETE);
      const created = await this.repository.createSubmission(
        {
          data: { authorId: viewer.id, contestId: contest.id, uploadId: upload.id, caption },
          include: submissionInclude(viewer.id, isOwner(member)),
        },
        tx,
      );
      const properties = { contestId: contest.id, groupId: contest.groupId };
      await this.repository.recordEvent(tx, {
        id: `submission:${created.id}`,
        type: ANALYTICS_EVENT.SUBMISSION_CREATED,
        userId: viewer.id,
        properties,
      });
      // 같은 그룹의 이전 대회에 참여했던 사람이 다시 참여했는지(재참여율)를 본다.
      const previous = await this.repository.findFirstSubmission(
        {
          where: {
            authorId: viewer.id,
            contest: { groupId: contest.groupId, endsAt: { lt: contest.startsAt } },
          },
          select: { id: true },
        },
        tx,
      );
      if (previous)
        await this.repository.recordEvent(tx, {
          id: `return:${contest.id}:${viewer.id}`,
          type: ANALYTICS_EVENT.NEXT_CONTEST_JOINED,
          userId: viewer.id,
          properties,
        });
      return { row: created, admin: isOwner(member) };
    });
    return presentSubmission(row, { completed: false, admin });
  }

  /** 비공개 사진 파일. 매 요청 멤버십을 확인하고, 숨긴 사진은 관리자에게만 준다. */
  async photoFile(viewer: IViewer, submissionId: string): Promise<Buffer> {
    const { submission } = await this.membership.accessibleSubmission(viewer.id, submissionId);
    const upload = await this.repository.findUniqueUpload({
      where: { id: submission.uploadId },
      select: { imageKey: true },
    });
    if (!upload?.imageKey) fail(ERROR_MESSAGE.SUBMISSION_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    return this.storage.get(upload.imageKey);
  }
}
