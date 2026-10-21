import { Injectable } from '@nestjs/common';
import type { IViewer } from '../auth/session.service';
import { randomToken, sha256Hex } from '../common/crypto';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import {
  MAX_PENDING_UPLOADS,
  MAX_UPLOAD_BYTES,
  POST_UPLOAD_TTL_SECONDS,
  UPLOAD_TICKET_TTL_MS,
  COMPLETED_POST_UPLOAD_TTL_MS,
  POST_UPLOAD_LEASE_MS,
  MAX_MEDIA_COMPLETIONS,
  IMAGE_HEADER_BYTES,
  MEDIA_RANGE_BLOCK_BYTES,
} from '../config/limits';
import { Database } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';
import { MembershipService } from '../group/membership.service';
import { reportUnexpectedError } from '../monitoring/sentry';
import { createMediaKey, createStagingKey, MediaStorage } from '../storage/media-storage.service';
import { MediaReader } from '../storage/media-reader';
import { MediaProcessor } from '../post/media-processor';
import { postUploadPolicy } from '../post/post-upload.policy';
import { processPhoto } from '../submission/photo-processor';
import { phase, PHASE } from '../contest/contest.policy';

@Injectable()
export class MediaUploadService {
  private activeCompletions = 0;
  constructor(
    private readonly db: Database,
    private readonly transactions: UnitOfWork,
    private readonly membership: MembershipService,
    private readonly storage: MediaStorage,
    private readonly processor: MediaProcessor,
  ) {}
  async requestUpload(
    viewer: IViewer,
    groupId: string,
    contentType: string,
    byteSize: number,
    contestId?: string,
  ) {
    const policy = postUploadPolicy(contentType, byteSize);
    if (contestId && (policy.kind !== 'PHOTO' || byteSize > MAX_UPLOAD_BYTES))
      fail('10MB 이하의 JPEG, PNG, WebP 사진을 선택해 주세요.');
    const { upload, id } = await this.transactions.atomic(async (tx) => {
      await this.membership.requireMember(viewer.id, groupId, tx);
      if (contestId) {
        const { contest } = await this.membership.accessibleContest(viewer.id, contestId, { client: tx });
        if (contest.groupId !== groupId || phase(contest) !== PHASE.SUBMISSION)
          fail(ERROR_MESSAGE.NOT_SUBMISSION_PHASE);
      }
      const now = new Date();
      const pending = contestId
        ? await tx.upload.count({
            where: { userId: viewer.id, contestId, expiresAt: { gt: now }, submission: null },
          })
        : await tx.postUpload.count({
            where: { userId: viewer.id, expiresAt: { gt: now }, post: null, submissionUpload: null },
          });
      if (pending >= MAX_PENDING_UPLOADS)
        fail('업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', ERROR_CODE.RATE_LIMITED);
      const upload = await tx.postUpload.create({
        data: {
          userId: viewer.id,
          groupId,
          tokenHash: sha256Hex(randomToken()),
          stagingKey: createStagingKey(),
          kind: policy.kind,
          contentType,
          byteSize,
          expiresAt: new Date(
            now.getTime() + (contestId ? UPLOAD_TICKET_TTL_MS : POST_UPLOAD_TTL_SECONDS * 1000),
          ),
        },
      });
      const submission = contestId
        ? await tx.upload.create({
            data: {
              userId: viewer.id,
              contestId,
              tokenHash: sha256Hex(randomToken()),
              mediaUploadId: upload.id,
              expiresAt: upload.expiresAt,
            },
          })
        : null;
      return { upload, id: submission?.id ?? upload.id };
    });
    const form = await this.storage.presignUpload(
      upload.stagingKey ?? '',
      contentType,
      byteSize,
      upload.expiresAt,
    );
    return {
      id,
      expiresAt: upload.expiresAt,
      url: form.url,
      fields: Object.entries(form.fields).map(([name, value]) => ({ name, value })),
    };
  }

  async completeUpload(viewer: IViewer, uploadId: string, submissionId?: string) {
    if (this.activeCompletions >= MAX_MEDIA_COMPLETIONS)
      fail('파일 확인 요청이 많습니다. 잠시 후 다시 시도해 주세요.', ERROR_CODE.RATE_LIMITED);
    this.activeCompletions++;
    try {
      return await this.finishUpload(viewer, uploadId, submissionId);
    } finally {
      this.activeCompletions--;
    }
  }

  private async finishUpload(viewer: IViewer, uploadId: string, submissionId?: string) {
    const operationName = submissionId ? 'completeSubmissionUpload' : 'completePostUpload';
    const claimed = await this.transactions.atomic(async (tx) => {
      const upload = await tx.postUpload.findUnique({
        where: { id: uploadId },
        include: { submissionUpload: true },
      });
      if (!upload || upload.userId !== viewer.id || upload.expiresAt <= new Date())
        fail('업로드 요청이 만료되었거나 유효하지 않습니다.', ERROR_CODE.FORBIDDEN);
      if ((upload.submissionUpload?.id ?? undefined) !== submissionId)
        fail('업로드 요청이 만료되었거나 유효하지 않습니다.', ERROR_CODE.FORBIDDEN);
      if (upload.submissionUpload) {
        if (upload.submissionUpload.expiresAt <= new Date()) fail('이미 사용했거나 만료된 업로드입니다.');
        const { contest } = await this.membership.accessibleContest(
          viewer.id,
          upload.submissionUpload.contestId,
          { client: tx },
        );
        if (phase(contest) !== PHASE.SUBMISSION) fail(ERROR_MESSAGE.NOT_SUBMISSION_PHASE);
      }
      await this.membership.requireMember(viewer.id, upload.groupId, tx);
      if (upload.storageKey) return { upload, key: null };
      if (!upload.stagingKey) fail('업로드 요청을 다시 시작해 주세요.');
      if (
        upload.completionStartedAt &&
        upload.completionStartedAt.getTime() > Date.now() - POST_UPLOAD_LEASE_MS
      )
        fail('파일을 확인 중입니다. 잠시 후 다시 시도해 주세요.', ERROR_CODE.CONFLICT);
      const policy = postUploadPolicy(upload.contentType, upload.byteSize);
      const key = createMediaKey(submissionId ? 'webp' : policy.extension);
      await tx.postUpload.update({
        where: { id: upload.id },
        data: { completionKey: key, completionStartedAt: new Date() },
      });
      // 외부 복사 전에 후보 키를 남겨 프로세스 종료 후에도 정리할 수 있게 한다.
      await tx.postUploadAttempt.create({ data: { key, uploadId: upload.id } });
      return { upload, key };
    });
    const { upload, key } = claimed;
    if (!key) return this.uploadResult(upload);
    let commitStarted = false;
    try {
      const source = upload.stagingKey ?? '';
      await this.assertUploadedObject(source, upload);
      await this.storage.copy(source, key);
      // 대회 사진은 WebP로 변환할 후보다. 로컬 저장소는 확장자로 타입을 판단하므로 변환 후 확인한다.
      await this.assertUploadedObject(key, upload, !submissionId);
      const reader = new MediaReader(
        this.storage,
        key,
        upload.byteSize,
        upload.kind === 'PHOTO' ? IMAGE_HEADER_BYTES : undefined,
      );
      const media = submissionId
        ? await this.normalizeSubmission(reader, key)
        : { ...(await this.processor.process(reader, upload.contentType)), byteSize: upload.byteSize };
      if (submissionId) await this.assertUploadedObject(key, media);
      commitStarted = true;
      const completed = await this.transactions.atomic(async (tx) => {
        await this.membership.requireMember(viewer.id, upload.groupId, tx);
        if (upload.submissionUpload) {
          const grant = await tx.upload.findUniqueOrThrow({ where: { id: upload.submissionUpload.id } });
          const { contest } = await this.membership.accessibleContest(viewer.id, grant.contestId, {
            client: tx,
          });
          if (grant.expiresAt <= new Date() || phase(contest) !== PHASE.SUBMISSION)
            fail(ERROR_MESSAGE.NOT_SUBMISSION_PHASE);
          await tx.upload.update({ where: { id: grant.id }, data: { imageKey: key } });
        }
        const changed = await tx.postUpload.updateMany({
          where: { id: upload.id, storageKey: null, completionKey: key, expiresAt: { gt: new Date() } },
          data: {
            storageKey: key,
            kind: media.kind,
            contentType: media.contentType,
            byteSize: media.byteSize,
            completionKey: null,
            completionStartedAt: null,
            expiresAt: new Date(Date.now() + COMPLETED_POST_UPLOAD_TTL_MS),
          },
        });
        if (changed.count !== 1) fail('이미 사용했거나 만료된 업로드입니다.', ERROR_CODE.CONFLICT);
        await tx.postUploadAttempt.delete({ where: { key } });
        return tx.postUpload.findUniqueOrThrow({ where: { id: upload.id } });
      });
      // 서명 주소는 만료 전 재사용할 수 있으므로 stagingKey는 추후 정리에서도 유지한다.
      await this.storage
        .delete(source)
        .catch((error: unknown) =>
          reportUnexpectedError(error, { operationName, location: 'staging-cleanup' }),
        );
      return this.uploadResult(completed);
    } catch (error) {
      // COMMIT 응답 유실은 성공과 구분되지 않는다. 게시됐을 수 있는 파일은 지우지 않는다.
      if (commitStarted) {
        const current = await this.db.postUpload.findUnique({ where: { id: upload.id } }).catch(() => null);
        if (current?.storageKey === key) return this.uploadResult(current);
        throw error;
      }
      try {
        await this.storage.delete(key);
        await this.db.postUploadAttempt.deleteMany({ where: { key } });
      } catch (cleanupError) {
        reportUnexpectedError(cleanupError, {
          operationName,
          location: 'candidate-cleanup',
        });
      }
      await this.db.postUpload.updateMany({
        where: { id: upload.id, completionKey: key },
        data: { completionKey: null, completionStartedAt: null },
      });
      throw error;
    }
  }

  private async normalizeSubmission(reader: MediaReader, key: string) {
    const chunks: Buffer[] = [];
    for (let start = 0; start < reader.byteSize; start += MEDIA_RANGE_BLOCK_BYTES)
      chunks.push(await reader.read(start, Math.min(MEDIA_RANGE_BLOCK_BYTES, reader.byteSize - start)));
    const bytes = await processPhoto(Buffer.concat(chunks, reader.byteSize));
    // 아직 공개되지 않은 후보만 교체한다. 로컬 저장소는 기존 파일 덮어쓰기를 거부한다.
    await this.storage.delete(key);
    await this.storage.put(key, bytes, 'image/webp');
    return { kind: 'PHOTO', contentType: 'image/webp', byteSize: bytes.length };
  }

  private async assertUploadedObject(
    key: string,
    expected: { byteSize: number; contentType: string },
    checkType = true,
  ) {
    let actual;
    try {
      actual = await this.storage.head(key);
    } catch {
      return fail('파일 전송을 완료한 뒤 다시 시도해 주세요.');
    }
    if (actual.byteSize !== expected.byteSize || (checkType && actual.contentType !== expected.contentType))
      fail('업로드한 파일의 크기와 형식을 확인해 주세요.');
  }

  private uploadResult(upload: { id: string; kind: string; contentType: string; byteSize: number }) {
    return { id: upload.id, kind: upload.kind, contentType: upload.contentType, byteSize: upload.byteSize };
  }
}
