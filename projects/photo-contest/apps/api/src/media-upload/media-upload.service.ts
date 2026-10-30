import { Injectable } from '@nestjs/common';
import { match } from 'ts-pattern';

import type { IViewer } from '../auth/session/session.service';
import { randomToken, sha256Hex } from '../common/crypto';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import {
  COMPLETED_POST_UPLOAD_TTL_MS,
  MAX_PENDING_UPLOADS,
  MAX_UPLOAD_BYTES,
  POST_UPLOAD_TTL_SECONDS,
  UPLOAD_TICKET_TTL_MS,
} from '../config/limits';
import { phase, PHASE } from '../contest/contest.policy';
import { Database, type TDatabaseClient } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';
import { MembershipService } from '../group/membership/membership.service';
import { postUploadPolicy } from '../post/media/post-upload.policy';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { createMediaKey, MediaStorage } from '../storage/media-storage.service';
import { uploadedObjectMetadata } from '../storage/uploaded-object';
import { assertStorageQuota } from './storage-quota';

type TUploadPurpose = { kind: 'POST' } | { kind: 'SUBMISSION'; contestId: string } | { kind: 'GROUP_AVATAR' };
type TCompletionPurpose = { submissionId: string } | { avatarId: string };
interface IUploadTicket {
  id: string;
  userId: string;
  groupId: string;
  /** null이면 게시물·대회 사진·대표 사진에 붙어 만료가 없다. */
  expiresAt: Date | null;
  storageKey: string | null;
  stagingKey: string | null;
  kind: string;
  contentType: string;
  byteSize: number;
  submissionUpload: { id: string; contestId: string; expiresAt: Date } | null;
  groupAvatar: { id: string; expiresAt: Date } | null;
}

const REJECTED = '업로드 요청이 만료되었거나 유효하지 않습니다.';
const USED = '이미 사용했거나 만료된 업로드입니다.';

/**
 * 게시물·대회 사진·그룹 대표 사진의 공용 업로드. 발급할 때 형식·크기를 정하고 최종 키에 POST 정책을 서명한다.
 * 완료는 HEAD로 크기·형식만 확인한다. 서버는 파일 내용을 읽거나 변환하지 않는다.
 */
@Injectable()
export class MediaUploadService {
  constructor(
    private readonly db: Database,
    private readonly transactions: UnitOfWork,
    private readonly membership: MembershipService,
    private readonly storage: MediaStorage,
    private readonly limits: RateLimitService,
  ) {}

  /** @param address 요청 주소(`@ClientAddress()`). 운영에서 주소별 하루 업로드 용량을 센다. */
  async requestUpload(
    viewer: IViewer,
    groupId: string,
    contentType: string,
    byteSize: number,
    purpose: TUploadPurpose = { kind: 'POST' },
    address: string | null = null,
  ) {
    const { contestId, avatar } = match(purpose)
      .returnType<{ contestId: string | undefined; avatar: boolean }>()
      .with({ kind: 'POST' }, () => ({ contestId: undefined, avatar: false }))
      .with({ kind: 'SUBMISSION' }, (submission) => ({ contestId: submission.contestId, avatar: false }))
      .with({ kind: 'GROUP_AVATAR' }, () => ({ contestId: undefined, avatar: true }))
      .exhaustive();
    const policy = postUploadPolicy(contentType, byteSize);
    if ((contestId || avatar) && (policy.kind !== 'PHOTO' || byteSize > MAX_UPLOAD_BYTES))
      fail('10MB 이하의 JPEG, PNG, WebP 사진을 선택해 주세요.');
    const key = createMediaKey(policy.extension);
    const expiresAt = new Date(
      Date.now() + (contestId || avatar ? UPLOAD_TICKET_TTL_MS : POST_UPLOAD_TTL_SECONDS * 1000),
    );
    // 서명 준비에는 자격 증명 조회가 포함될 수 있어 트랜잭션 밖에서 하고, 발급 커밋 뒤에만 응답에 싣는다.
    const form = await this.storage.presignUpload(key, contentType, byteSize, expiresAt);
    const id = await this.transactions.atomic(async (tx) => {
      if (avatar) await this.membership.requireAdmin(viewer.id, groupId, tx);
      if (!avatar) await this.membership.requireMember(viewer.id, groupId, tx);
      if (contestId) {
        const { contest } = await this.membership.accessibleContest(viewer.id, contestId, { client: tx });
        if (contest.groupId !== groupId || phase(contest) !== PHASE.SUBMISSION)
          fail(ERROR_MESSAGE.NOT_SUBMISSION_PHASE);
      }
      const now = new Date();
      if (expiresAt <= now) fail('업로드 요청이 만료되었습니다. 다시 시도해 주세요.', ERROR_CODE.CONFLICT);
      await assertStorageQuota(tx, viewer, byteSize);
      const pending = contestId
        ? await tx.upload.count({
            where: { userId: viewer.id, contestId, expiresAt: { gt: now }, submission: null },
          })
        : await tx.postUpload.count({
            where: {
              userId: viewer.id,
              expiresAt: { gt: now },
              post: null,
              submissionUpload: null,
              ...(avatar
                ? { groupId, groupAvatar: { is: { currentGroups: { none: {} }, coverGroups: { none: {} } } } }
                : { groupAvatar: null }),
            },
          });
      if (pending >= MAX_PENDING_UPLOADS)
        fail('업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', ERROR_CODE.RATE_LIMITED);
      await this.limits.consumeUploadBytes(address, byteSize, tx);
      // 브라우저는 공개될 최종 키에 바로 올린다. 완료 전까지는 stagingKey에만 두어 게시에 쓰지 못한다.
      const upload = await tx.postUpload.create({
        data: {
          userId: viewer.id,
          groupId,
          tokenHash: sha256Hex(randomToken()),
          stagingKey: key,
          kind: policy.kind,
          contentType,
          byteSize,
          expiresAt,
          // 완료하면 expiresAt은 게시 유효기간으로 바뀐다. 저장소가 이 키에 쓰기를 받는 마지막 시각은 따로 둔다.
          policyExpiresAt: expiresAt,
        },
      });
      const submission = contestId
        ? await tx.upload.create({
            data: {
              userId: viewer.id,
              contestId,
              tokenHash: sha256Hex(randomToken()),
              mediaUploadId: upload.id,
              expiresAt,
            },
          })
        : null;
      const groupAvatar = avatar
        ? await tx.groupAvatar.create({
            data: { groupId, mediaUploadId: upload.id, storageKey: key, expiresAt },
          })
        : null;
      return submission?.id ?? groupAvatar?.id ?? upload.id;
    });
    return {
      id,
      expiresAt,
      url: form.url,
      fields: Object.entries(form.fields).map(([name, value]) => ({ name, value })),
    };
  }

  async completeUpload(viewer: IViewer, uploadId: string, purpose?: TCompletionPurpose) {
    const ticket = await this.findTicket(this.db, uploadId);
    this.assertTicket(viewer, ticket, purpose);
    const key = ticket.storageKey ?? ticket.stagingKey;
    if (!key) return fail('업로드 요청을 다시 시작해 주세요.');
    // 저장소 I/O는 트랜잭션 밖에서 한다. 확정은 권한을 다시 확인하는 트랜잭션 하나로 끝낸다.
    if (!ticket.storageKey) await this.assertUploadedObject(key, ticket);
    const completed = await this.transactions.atomic(async (tx) => {
      const current = await this.findTicket(tx, uploadId);
      this.assertTicket(viewer, current, purpose);
      await this.assertAccess(viewer, current, tx);
      if (current.storageKey) return current;
      if (current.stagingKey !== key) fail(USED, ERROR_CODE.CONFLICT);
      // 대회 사진·대표 사진은 각자의 기한으로 사용과 정리를 판단하므로 게시 기한과 함께 늘린다.
      const expiresAt = new Date(Date.now() + COMPLETED_POST_UPLOAD_TTL_MS);
      if (current.submissionUpload)
        await tx.upload.update({
          where: { id: current.submissionUpload.id },
          data: { imageKey: key, expiresAt },
        });
      if (current.groupAvatar)
        await tx.groupAvatar.update({ where: { id: current.groupAvatar.id }, data: { expiresAt } });
      await tx.postUpload.update({
        where: { id: current.id },
        data: { storageKey: key, stagingKey: null, expiresAt },
      });
      return { ...current, storageKey: key };
    });
    return {
      id: completed.id,
      kind: completed.kind,
      contentType: completed.contentType,
      byteSize: completed.byteSize,
    };
  }

  private findTicket(client: TDatabaseClient, id: string): Promise<IUploadTicket | null> {
    return client.postUpload.findUnique({
      where: { id },
      include: {
        submissionUpload: { select: { id: true, contestId: true, expiresAt: true } },
        groupAvatar: { select: { id: true, expiresAt: true } },
      },
    });
  }

  /** 티켓 소유자·만료·용도가 맞아야 한다. 게시물 티켓을 대회·대표 사진에 쓰거나 그 반대로 쓰지 못한다. */
  private assertTicket(
    viewer: IViewer,
    ticket: IUploadTicket | null,
    purpose?: TCompletionPurpose,
  ): asserts ticket is IUploadTicket {
    const submissionId = purpose && 'submissionId' in purpose ? purpose.submissionId : undefined;
    const avatarId = purpose && 'avatarId' in purpose ? purpose.avatarId : undefined;
    if (
      !ticket ||
      ticket.userId !== viewer.id ||
      (ticket.expiresAt && ticket.expiresAt <= new Date()) ||
      ticket.submissionUpload?.id !== submissionId ||
      ticket.groupAvatar?.id !== avatarId
    )
      fail(REJECTED, ERROR_CODE.FORBIDDEN);
    if (ticket.groupAvatar && ticket.groupAvatar.expiresAt <= new Date()) fail(USED);
    if (ticket.submissionUpload && ticket.submissionUpload.expiresAt <= new Date()) fail(USED);
  }

  private async assertAccess(viewer: IViewer, ticket: IUploadTicket, tx: TDatabaseClient) {
    if (ticket.groupAvatar) await this.membership.requireAdmin(viewer.id, ticket.groupId, tx);
    if (!ticket.groupAvatar) await this.membership.requireMember(viewer.id, ticket.groupId, tx);
    if (!ticket.submissionUpload) return;
    const { contest } = await this.membership.accessibleContest(
      viewer.id,
      ticket.submissionUpload.contestId,
      {
        client: tx,
      },
    );
    if (phase(contest) !== PHASE.SUBMISSION) fail(ERROR_MESSAGE.NOT_SUBMISSION_PHASE);
  }

  /** 정책이 막지만 저장소가 다른 크기·형식을 받아도 확정하지 않는다. */
  private async assertUploadedObject(key: string, expected: { byteSize: number; contentType: string }) {
    const actual = await uploadedObjectMetadata(this.storage, key);
    if (actual.byteSize !== expected.byteSize || actual.contentType !== expected.contentType)
      fail('업로드한 파일의 크기와 형식을 확인해 주세요.');
  }
}
