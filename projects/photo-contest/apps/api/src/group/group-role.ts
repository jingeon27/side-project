export const GROUP_ROLE = {
  OWNER: 'OWNER',
  MEMBER: 'MEMBER',
} as const;

export type TGroupRole = (typeof GROUP_ROLE)[keyof typeof GROUP_ROLE];

/** DB에는 문자열로 저장한다. 알 수 없는 값은 권한이 적은 MEMBER로 본다. */
export function toGroupRole(role: string): TGroupRole {
  return role === GROUP_ROLE.OWNER ? GROUP_ROLE.OWNER : GROUP_ROLE.MEMBER;
}

export function isOwner(member: { role: string }) {
  return member.role === GROUP_ROLE.OWNER;
}
