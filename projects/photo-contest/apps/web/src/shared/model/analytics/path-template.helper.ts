/** ID·토큰이 들어가는 경로. 분석 이벤트에는 원문 대신 이름표(:id, :token)를 보낸다. */
const DYNAMIC_SEGMENTS = [
  { prefix: 'groups', placeholder: ':id' },
  { prefix: 'contests', placeholder: ':id' },
  { prefix: 'invite', placeholder: ':token' },
] as const satisfies readonly { prefix: string; placeholder: `:${string}` }[];

/**
 * `/groups/clx1?sort=popular` → `/groups/:id`. 쿼리·해시는 버리고, 초대 토큰처럼 다시 쓰면 안 되는 값이 이벤트에 남지 않게 한다.
 * 알 수 없는 경로의 두 번째 조각도 지운다(잘못 들어온 주소에 개인정보가 섞여 있을 수 있다).
 */
export function toPathTemplate(path: string) {
  const pathname = path.split(/[?#]/)[0] || '/';
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  const [first, ...rest] = segments;
  const known = DYNAMIC_SEGMENTS.find((segment) => segment.prefix === first);
  if (known) return `/${first}${rest.length > 0 ? `/${known.placeholder}` : ''}`;
  return rest.length > 0 ? `/${first}/:path` : `/${first}`;
}
