import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { POSTS_CACHE_TAG } from '@game-feedback/contracts';

import { lockActiveUser } from '../../auth/account/user-write';
import { requireUser } from '../../auth/session/session-access';
import type { SessionRequest } from '../../auth/session/session.types';
import { CacheInvalidationService } from '../../cache-invalidation/cache-invalidation.service';
import { ApiError } from '../../common/http/api-error';
import { UnitOfWork } from '../../database/unit-of-work';
import { PrismaClient } from '../../generated/prisma';
import {
  completionDeadline,
  MEDIA_COMPLETE_GRACE_SECONDS,
  presignExpiry,
} from '../../media-storage/media-storage.policy';
import { MediaStorage } from '../../media-storage/media-storage.service';
import { UsersService } from '../users.service';
import { UserVisibilityService } from '../visibility/user-visibility.service';
import type { TAvatarUploadDto } from './avatar-upload.dto';
import type { TUpdateProfileDto } from './profile-input.dto';

@Injectable()
export class ProfileService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
    @Inject(MediaStorage) private readonly storage: MediaStorage,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(CacheInvalidationService) private readonly cache: CacheInvalidationService,
  ) {}
  async update(req: SessionRequest, input: TUpdateProfileDto) {
    const user = requireUser(req);
    const { nickname, bio } = input;
    await this.cache.change(
      async (tx) => {
        await lockActiveUser({ client: tx, userId: user.id });
        return tx.user.update({
          where: { id: user.id },
          data: {
            ...(nickname !== undefined ? { nickname } : {}),
            ...(bio !== undefined ? { bio } : {}),
          },
        });
      },
      [POSTS_CACHE_TAG],
    );
    return this.users.profile(req, user.id);
  }
  async requestUpload(req: SessionRequest, data: TAvatarUploadDto) {
    const user = requireUser(req);
    const upload = await this.storage.prepareUpload(data.mimeType, data.size);
    const ticket = await this.transactions.run(async (tx) => {
      await lockActiveUser({ client: tx, userId: user.id });
      if (
        (await tx.avatarUpload.count({
          where: { userId: user.id, completedAt: null, expiresAt: { gt: new Date() } },
        })) >= 10
      )
        throw new ApiError(
          429,
          'UPLOAD_LIMIT',
          '프로필 사진 업로드 요청이 많습니다. 잠시 후 다시 시도해주세요.',
        );
      const object = await tx.mediaObject.create({ data: upload.object, select: { id: true } });
      return tx.avatarUpload.create({
        data: {
          ...data,
          userId: user.id,
          objectId: object.id,
          expiresAt: presignExpiry(new Date()),
        },
      });
    });
    return { id: ticket.id, ...upload.form, expiresAt: ticket.expiresAt.toISOString() };
  }
  async completeUpload(req: SessionRequest, id: string) {
    const user = requireUser(req);
    const ticket = await this.db.avatarUpload.findFirst({
      where: { id, userId: user.id },
      include: { object: true },
    });
    if (!ticket) throw new ApiError(404, 'UPLOAD_NOT_FOUND', '프로필 사진 업로드 요청을 찾을 수 없습니다.');
    if (ticket.completedAt) return this.users.profile(req, user.id);
    if (completionDeadline(ticket.expiresAt) <= new Date())
      throw new ApiError(409, 'UPLOAD_EXPIRED', '프로필 사진 업로드가 만료되었습니다.');
    const stored = await this.storage.completeUpload(ticket);
    await this.cache.change(
      async (tx) => {
        await lockActiveUser({ client: tx, userId: user.id });
        const changed = await tx.avatarUpload.updateMany({
          where: {
            id,
            userId: user.id,
            completedAt: null,
            // expiresAt은 서명 만료다. 완료는 그 뒤 유예 시간까지 받는다.
            expiresAt: { gt: new Date(Date.now() - MEDIA_COMPLETE_GRACE_SECONDS * 1000) },
          },
          data: { completedAt: new Date(), objectId: stored.objectId },
        });
        if (!changed.count) {
          const current = await tx.avatarUpload.findUnique({ where: { id } });
          if (current?.completedAt) return;
          throw new ApiError(409, 'UPLOAD_EXPIRED', '프로필 사진 업로드가 만료되었습니다.');
        }
        const data = {
          bytes: null,
          objectId: stored.objectId,
          id: randomUUID(),
          size: ticket.size,
          mimeType: ticket.mimeType,
        };
        await tx.userAvatar.upsert({
          where: { userId: user.id },
          create: { ...data, userId: user.id },
          update: data,
        });
      },
      [POSTS_CACHE_TAG],
    );
    return this.users.profile(req, user.id);
  }
  async removeUpload(req: SessionRequest, id: string) {
    const user = requireUser(req);
    await this.db.avatarUpload.deleteMany({ where: { id, userId: user.id, completedAt: null } });
    return { ok: true };
  }
  async remove(req: SessionRequest) {
    const user = requireUser(req);
    await this.cache.change(
      async (tx) => {
        await lockActiveUser({ client: tx, userId: user.id });
        return tx.userAvatar.deleteMany({ where: { userId: user.id } });
      },
      [POSTS_CACHE_TAG],
    );
    return this.users.profile(req, user.id);
  }
  async file(req: SessionRequest, id: string) {
    const excluded = await this.visibility.excluded(req);
    const file = await this.db.userAvatar.findFirst({
      where: { userId: id, user: { id: { notIn: excluded } } },
      include: { object: true },
    });
    if (!file) throw new ApiError(404, 'AVATAR_NOT_FOUND', '프로필 사진을 찾을 수 없습니다.');
    return {
      mimeType: file.mimeType,
      size: file.size,
      location: await this.storage.presignRead(file, file.mimeType, 'inline'),
    };
  }
}
