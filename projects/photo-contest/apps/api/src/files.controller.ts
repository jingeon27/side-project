import { Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AuthService } from './auth.service';
import { ContestService, hash } from './contest.service';
import { Database } from './database';
import { fail, phase } from './policy';
import { deletePhoto, getPhoto, putPhoto } from './storage';
@Controller()
export class FilesController {
  constructor(
    private readonly db: Database,
    private readonly auth: AuthService,
    private readonly contests: ContestService,
  ) {}
  @Post('uploads/:token')
  async upload(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    const user = this.contests.requireUser(await this.auth.user(req));
    const grant = await this.db.upload.findUnique({ where: { tokenHash: hash(token) } });
    if (!grant || grant.userId !== user.id || grant.imageKey || grant.expiresAt < new Date())
      fail('업로드 요청이 만료되었거나 유효하지 않습니다.', 'FORBIDDEN');
    const { contest } = await this.contests.accessibleContest(this.db, user.id, grant.contestId);
    if (phase(contest) !== 'SUBMISSION') fail('사진 제출 기간이 아닙니다.');
    if (!Buffer.isBuffer(req.body) || !req.body.length || req.body.length > 10 * 1024 * 1024)
      fail('10MB 이하의 JPEG, PNG, WebP 사진을 선택해 주세요.');
    let image: Buffer;
    try {
      const source = sharp(req.body, { limitInputPixels: 40_000_000, failOn: 'warning' });
      const metadata = await source.metadata();
      if (
        !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > 40_000_000 ||
        (metadata.pages ?? 1) > 1
      )
        fail('지원하지 않는 사진 형식 또는 크기입니다.');
      image = await source
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      return fail('사진을 읽을 수 없습니다. JPEG, PNG, WebP 파일을 확인해 주세요.');
    }
    const imageKey = `${randomUUID()}.webp`;
    await putPhoto(imageKey, image);
    try {
      const updated = await this.db.upload.updateMany({
        where: { id: grant.id, imageKey: null, expiresAt: { gt: new Date() } },
        data: { imageKey },
      });
      if (updated.count !== 1) fail('이미 사용했거나 만료된 업로드입니다.');
    } catch (error) {
      await deletePhoto(imageKey);
      throw error;
    }
    res.status(201).json({ uploaded: true });
  }
  @Get('photos/:id')
  async photo(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const user = this.contests.requireUser(await this.auth.user(req));
    const submission = await this.db.submission.findUnique({ where: { id }, include: { upload: true } });
    if (!submission || !submission.upload.imageKey) fail('사진을 찾을 수 없습니다.', 'NOT_FOUND');
    const { member } = await this.contests.accessibleContest(this.db, user.id, submission.contestId);
    if (submission.hidden && member.role !== 'OWNER') fail('사진을 찾을 수 없습니다.', 'NOT_FOUND');
    const file = await getPhoto(submission.upload.imageKey);
    res
      .set({
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(file);
  }
}
