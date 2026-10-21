import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';

import { POSTS_CACHE_TAG, UpdateProfileInputSchema } from '@game-feedback/contracts';

import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { CacheInvalidationService } from '../cache-invalidation/cache-invalidation.service';
import { ApiError } from '../common/http/api-error';
import { parse } from '../common/validation';
import { PrismaClient } from '../generated/prisma';
import { MediaStorage } from '../media-storage/media-storage.service';
import { UserVisibilityService } from './user-visibility.service';
import { UsersService } from './users.service';

export const AVATAR_LIMIT = 5 * 1024 * 1024;
@Injectable()
export class ProfileService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
    @Inject(MediaStorage) private readonly storage: MediaStorage,
    @Inject(CacheInvalidationService) private readonly cache: CacheInvalidationService,
  ) {}
  async update(req: SessionRequest, input: unknown) {
    const user = requireUser(req);
    const { links } = parse(UpdateProfileInputSchema, input);
    await this.db.user.update({ where: { id: user.id }, data: { profileLinks: links } });
    return this.users.profile(req, user.id);
  }
  async upload(req: SessionRequest, input: unknown) {
    const user = requireUser(req);
    const file = input as { buffer?: unknown; mimetype?: unknown } | undefined;
    if (
      !Buffer.isBuffer(file?.buffer) ||
      !file.buffer.length ||
      file.buffer.length > AVATAR_LIMIT ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(String(file.mimetype))
    )
      throw new ApiError(400, 'INVALID_AVATAR', '5MB 이하의 JPEG, PNG, WebP 사진을 선택해주세요.');
    const bytes = await this.normalize(file.buffer);
    const stored = await this.storage.save(bytes, 'image/webp');
    const data = { ...stored, id: randomUUID(), size: bytes.length, mimeType: 'image/webp' };
    await this.cache.change(
      (tx) =>
        tx.userAvatar.upsert({
          where: { userId: user.id },
          create: { ...data, userId: user.id },
          update: data,
        }),
      [POSTS_CACHE_TAG],
    );
    return this.users.profile(req, user.id);
  }
  private async normalize(input: Buffer) {
    try {
      const image = sharp(input, { limitInputPixels: 40_000_000, animated: false });
      const metadata = await image.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) throw new Error('Unsupported format');
      return await image
        .rotate()
        .resize(512, 512, { fit: 'cover', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new ApiError(400, 'INVALID_AVATAR', '사진을 읽을 수 없습니다. 다른 사진을 선택해주세요.');
    }
  }
  async remove(req: SessionRequest) {
    const user = requireUser(req);
    await this.cache.change(
      (tx) => tx.userAvatar.deleteMany({ where: { userId: user.id } }),
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
      bytes: await this.storage.read(file, { start: 0, end: file.size - 1 }),
      mimeType: file.mimeType,
    };
  }
}
