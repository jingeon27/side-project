import type { Author, User } from '@game-feedback/contracts';

// demoKey remains an internal discriminator and is never included in public responses.
export const authorSelect = {
  avatar: { select: { id: true } },
  id: true,
  nickname: true,
  isVerified: true,
  supercellTag: true,
  demoKey: true,
} as const;
type PublicUserSource = {
  avatar?: { id: string } | null;
  id: string;
  nickname: string;
  isVerified: boolean;
  supercellTag: string | null;
  demoKey: string | null;
};
export function authorDto(user: PublicUserSource): Author {
  return {
    avatarUrl: user.avatar ? `/api/users/${encodeURIComponent(user.id)}/avatar?v=${user.avatar.id}` : null,
    id: user.id,
    nickname: user.nickname,
    isVerified: user.isVerified,
    supercellTag: user.supercellTag,
    isTestAccount: user.demoKey !== null,
  };
}
export function userDto(
  user: PublicUserSource & {
    role: string;
    createdAt: Date;
    verifiedAt: Date | null;
    bannedAt?: Date | null;
    banReason?: string | null;
  },
): User {
  return {
    ...authorDto(user),
    role: user.role === 'ADMIN' ? 'ADMIN' : 'USER',
    createdAt: user.createdAt.toISOString(),
    verifiedAt: user.verifiedAt?.toISOString() ?? null,
    bannedAt: user.bannedAt?.toISOString() ?? null,
    banReason: user.banReason ?? null,
  };
}
