/** 익명 세션으로 만든 사용자의 provider. 가입하면 같은 행이 회원 provider로 바뀐다. */
export const ANONYMOUS_PROVIDER = 'anonymous';

export function isAnonymous(user: { provider?: string } | null | undefined) {
  return user?.provider === ANONYMOUS_PROVIDER;
}
