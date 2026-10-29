import { Injectable } from '@nestjs/common';

import type { PostUpload } from '../../../generated/prisma';
import type { IViewer } from '../../auth/session/session.service';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../../common/errors';
import { Database, type TDatabaseClient } from '../../database/database.service';
import { MembershipService } from '../../group/membership/membership.service';
import { reportUnexpectedError } from '../../monitoring/sentry';
import { MediaStorage, mediaUrlTtlSeconds } from '../../storage/media-storage.service';
import { mediaDownloadDisposition, mediaDownloadFilename } from './media-download.policy';

@Injectable()
export class PostFileService {
  constructor(
    private readonly db: Database,
    private readonly membership: MembershipService,
    private readonly storage: MediaStorage,
  ) {}

  async requireCompletedUpload(
    viewer: IViewer,
    groupId: string,
    uploadId: string | null | undefined,
    client: TDatabaseClient,
  ) {
    if (!uploadId) return null;
    const upload = await client.postUpload.findUnique({
      where: { id: uploadId },
      include: { submissionUpload: true, groupAvatar: true, post: { select: { id: true } } },
    });
    if (upload?.post) fail(ERROR_MESSAGE.UPLOAD_ALREADY_USED, ERROR_CODE.CONFLICT);
    if (
      !upload ||
      upload.submissionUpload !== null ||
      upload.groupAvatar !== null ||
      upload.userId !== viewer.id ||
      upload.groupId !== groupId ||
      !upload.storageKey ||
      !upload.expiresAt ||
      upload.expiresAt <= new Date()
    )
      fail('업로드가 완료되지 않았거나 만료되었습니다.');
    return upload;
  }

  retainUpload(uploadId: string, client: TDatabaseClient) {
    // 게시한 업로드는 만료 범위에서 빼서 유지보수가 계속 다시 읽지 않게 한다.
    return client.postUpload.update({ where: { id: uploadId }, data: { expiresAt: null } });
  }

  releaseUpload(uploadId: string, client: TDatabaseClient) {
    // 글 삭제와 같은 트랜잭션에서 정리 대상으로 바꿔야 파일 삭제 실패 뒤에도 재시도할 수 있다.
    return client.postUpload.update({ where: { id: uploadId }, data: { expiresAt: new Date(0) } });
  }

  async cleanup(upload: PostUpload | null) {
    if (!upload) return;
    try {
      if (upload.storageKey) await this.storage.delete(upload.storageKey);
      if (upload.stagingKey) await this.storage.delete(upload.stagingKey);
      // POST 정책이 유효하면 같은 키로 재업로드할 수 있어, 만료 뒤 다시 지울 티켓을 남긴다.
      if (upload.policyExpiresAt && upload.policyExpiresAt > new Date()) return;
      await this.db.postUpload.deleteMany({ where: { id: upload.id, post: null } });
    } catch (error) {
      reportUnexpectedError(error, { operationName: 'deletePost', location: 'media-cleanup' });
    }
  }

  async read(viewer: IViewer | null, postId: string) {
    const file = await this.file(viewer, postId);
    return this.storage.presignRead(file.key);
  }

  async download(viewer: IViewer | null, postId: string) {
    const file = await this.file(viewer, postId);
    const url = await this.storage.presignRead(file.key, mediaDownloadDisposition(file.filename));
    const expiresAt = new Date(Date.now() + mediaUrlTtlSeconds(file.key) * 1000);
    return { url, filename: file.filename, expiresAt };
  }

  private async file(viewer: IViewer | null, postId: string) {
    const { post } = await this.membership.readablePost(viewer?.id ?? null, postId);
    if (!post.upload?.storageKey) fail('파일을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
    return {
      key: post.upload.storageKey,
      filename: mediaDownloadFilename(post.title, post.upload.storageKey),
    };
  }
}
