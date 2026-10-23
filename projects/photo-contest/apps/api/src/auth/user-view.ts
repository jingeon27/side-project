import type { Prisma } from '../../generated/prisma';

/** GraphQL User */
export interface IUserView {
  id: string;
  nickname: string;
  avatar: string | null;
  needsOnboarding?: boolean;
  avatarUploadId?: string | null;
}

/** User 응답에 필요한 열만 고른다. provider 식별자는 내보내지 않는다. */
export const USER_VIEW_SELECT = {
  id: true,
  nickname: true,
  avatar: true,
  needsOnboarding: true,
  avatarUploadId: true,
} as const satisfies Prisma.UserSelect;
