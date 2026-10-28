import { match } from 'ts-pattern';

export const GROUP_ROLE = {
  OWNER: 'OWNER',
  MODERATOR: 'MODERATOR',
  MEMBER: 'MEMBER',
} as const;

export type TGroupRole = (typeof GROUP_ROLE)[keyof typeof GROUP_ROLE];

/** DB에는 문자열로 저장한다. 알 수 없는 값은 권한이 적은 MEMBER로 본다. */
export function toGroupRole(role: string): TGroupRole {
  return match(role)
    .returnType<TGroupRole>()
    .with(GROUP_ROLE.OWNER, () => GROUP_ROLE.OWNER)
    .with(GROUP_ROLE.MODERATOR, () => GROUP_ROLE.MODERATOR)
    .otherwise(() => GROUP_ROLE.MEMBER);
}

export function isOwner(member: { role: string }) {
  return member.role === GROUP_ROLE.OWNER;
}

export function isAdmin(member: { role: string }) {
  return isOwner(member) || member.role === GROUP_ROLE.MODERATOR;
}
