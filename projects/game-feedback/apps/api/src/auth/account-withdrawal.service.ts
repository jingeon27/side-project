import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../common/http/api-error';
import { UnitOfWork } from '../database/unit-of-work';
import { Prisma } from '../generated/prisma';
import { socialIdentityHash } from './social-identity-hash';

@Injectable()
export class AccountWithdrawalService {
  constructor(@Inject(UnitOfWork) private readonly transactions: UnitOfWork) {}

  async withdraw(userId: string) {
    await this.transactions.run(async (tx) => {
      // 관리자 제재와 같은 행을 잠근 뒤 최신 상태로 탈퇴를 처리한다.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId }, include: { socialIdentities: true } });
      if (!user || user.withdrawnAt) throw new ApiError(401, 'UNAUTHENTICATED', '로그인이 필요합니다.');
      const identities = [
        ...user.socialIdentities.map(({ provider, subject }) => ({ provider, subject })),
        ...(user.googleSubject ? [{ provider: 'google', subject: user.googleSubject }] : []),
      ];
      if (user.bannedAt)
        await tx.retainedIdentityRestriction.createMany({
          data: identities.map(({ provider, subject }) => ({
            identityHash: socialIdentityHash(provider, subject),
            userId,
          })),
          skipDuplicates: true,
        });
      if (!user.bannedAt) await tx.retainedIdentityRestriction.deleteMany({ where: { userId } });

      const withdrawnAt = new Date();
      await tx.post.updateMany({
        where: { authorId: userId },
        data: {
          deletedAt: withdrawnAt,
          title: '삭제된 요청',
          body: '',
          gameProfile: Prisma.DbNull,
          document: Prisma.DbNull,
          coaching: Prisma.DbNull,
          friendSale: Prisma.DbNull,
          battle: Prisma.DbNull,
        },
      });
      await tx.answer.updateMany({
        where: { authorId: userId },
        data: { deletedAt: withdrawnAt, body: '', helpful: false },
      });
      await tx.comment.updateMany({
        where: { authorId: userId },
        data: { deletedAt: withdrawnAt, body: '' },
      });
      await tx.notification.deleteMany({
        where: { OR: [{ actorId: userId }, { userId }, { post: { authorId: userId } }] },
      });
      await tx.postMedia.deleteMany({
        where: { OR: [{ uploaderId: userId }, { post: { authorId: userId } }] },
      });
      await tx.chatConversation.deleteMany({
        where: { OR: [{ firstUserId: userId }, { secondUserId: userId }] },
      });
      await tx.chatAttachment.deleteMany({ where: { uploaderId: userId } });
      await tx.userAvatar.deleteMany({ where: { userId } });
      await tx.gameAccount.deleteMany({ where: { userId } });
      await tx.userFollow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } });
      await tx.block.deleteMany({ where: { OR: [{ userId }, { blockedUserId: userId }] } });
      await tx.report.deleteMany({ where: { reporterId: userId } });
      await tx.session.deleteMany({
        where: {
          OR: [
            { userId },
            ...identities.map(({ provider, subject }) => ({
              pendingProvider: provider,
              pendingSubject: subject,
            })),
            ...(user.googleSubject ? [{ pendingProvider: null, pendingSubject: user.googleSubject }] : []),
          ],
        },
      });
      await tx.appLoginTicket.deleteMany({ where: { OR: identities } });
      await tx.socialIdentity.deleteMany({ where: { userId } });
      // 다른 작성자의 답변·댓글이 참조하는 작성자 행만 익명으로 남긴다.
      await tx.user.update({
        where: { id: userId },
        data: {
          withdrawnAt,
          nickname: '탈퇴한 사용자',
          googleSubject: null,
          demoKey: null,
          profileLinks: [],
          supercellTag: null,
          isVerified: false,
          verifiedAt: null,
          role: 'USER',
          termsVersion: '',
          ageConfirmed: false,
        },
      });
    });
  }
}
