import { uniqBy } from 'es-toolkit';

import type { TSocialProvider } from '@game-feedback/contracts';

import { hash } from '../../common/crypto';
import { ApiError } from '../../common/http/api-error';
import type { Prisma, PrismaClient } from '../../generated/prisma';

type TClient = PrismaClient | Prisma.TransactionClient;

/**
 * Deleting an account removes its SocialIdentity rows, so a banned user could sign up again with the same
 * social login. Keep `(provider, sha256(subject))` for every login identity of a banned user instead.
 */
export async function recordBannedIdentities(db: TClient, userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { googleSubject: true, socialIdentities: { select: { provider: true, subject: true } } },
  });
  if (!user) return;
  const identities = uniqBy(
    [
      ...user.socialIdentities,
      ...(user.googleSubject ? [{ provider: 'google', subject: user.googleSubject }] : []),
    ].map(({ provider, subject }) => ({ provider, subjectHash: hash(subject), userId })),
    (identity) => `${identity.provider}:${identity.subjectHash}`,
  );
  if (identities.length) await db.bannedIdentity.createMany({ data: identities, skipDuplicates: true });
}

export function clearBannedIdentities(db: TClient, userId: string) {
  return db.bannedIdentity.deleteMany({ where: { userId } });
}

export async function isBannedIdentity(db: TClient, provider: TSocialProvider, subject: string) {
  const banned = await db.bannedIdentity.findUnique({
    where: { provider_subjectHash: { provider, subjectHash: hash(subject) } },
    select: { provider: true },
  });
  return Boolean(banned);
}

export function bannedIdentityError() {
  return new ApiError(403, 'USER_BANNED', '이용이 제한된 소셜 계정으로는 다시 가입할 수 없습니다.');
}

/** Rejects creating a new account for a login identity whose previous account was banned. */
export async function assertIdentityNotBanned(db: TClient, provider: TSocialProvider, subject: string) {
  if (await isBannedIdentity(db, provider, subject)) throw bannedIdentityError();
}
