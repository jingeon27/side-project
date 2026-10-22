import { isIPv4, isIPv6 } from 'node:net';

import type { Request } from 'express';

import { trustedProxyHops } from '../../config/env';

const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
const IPV6_GROUPS = 8;
// 가입자 한 명에게 보통 /64를 통째로 주므로 그 안의 주소를 바꿔 가며 제한을 피하지 못하게 묶는다.
const IPV6_PREFIX_GROUPS = 4;

function ipv6Groups(address: string): string[] {
  const [withoutZone = ''] = address.split('%');
  const [head = '', tail] = withoutZone.split('::');
  const toGroups = (part: string) =>
    part
      .split(':')
      .filter(Boolean)
      // 끝에 붙은 IPv4 표기(::ffff:1.2.3.4 등)는 두 그룹을 차지한다.
      .flatMap((group) => (group.includes('.') ? ['0', '0'] : [group]));
  const left = toGroups(head);
  const right = tail === undefined ? [] : toGroups(tail);
  const zeros = Array.from({ length: Math.max(IPV6_GROUPS - left.length - right.length, 0) }, () => '0');
  return [...left, ...zeros, ...right].map((group) => Number.parseInt(group, 16).toString(16));
}

/**
 * 요청 제한 키로 쓰는 클라이언트 주소. Express가 확인한 req.ip를 넘긴다.
 * IPv4(IPv4-mapped IPv6 포함)는 그대로, IPv6는 /64 단위로 묶는다.
 */
export function clientAddressKey(address: string | undefined): string {
  if (!address) return 'unknown';
  const mapped = IPV4_MAPPED.exec(address)?.[1];
  if (mapped && isIPv4(mapped)) return mapped;
  if (!isIPv6(address)) return address;
  return `${ipv6Groups(address).slice(0, IPV6_PREFIX_GROUPS).join(':')}::/64`;
}

/**
 * 사용자 요청 제한에 쓸 주소. 프록시를 신뢰하는데(TRUST_PROXY_HOPS>0) 전달 헤더가 없으면 null이다.
 * Caddy는 늘 X-Forwarded-For를 붙이고 웹의 /backend/graphql 프록시와 SSR도 그 값을 넘기므로,
 * 헤더 없는 요청은 같은 내부망의 웹 서버가 보낸 공개 캐시 조회·헬스 체크다. 이를 웹 컨테이너 주소 하나로 묶어
 * 제한하면 사용자 한 명이 사이트 전체의 SSR을 막을 수 있다.
 */
export function rateLimitAddress(req: Request): string | null {
  if (trustedProxyHops() > 0 && req.headers['x-forwarded-for'] === undefined) return null;
  return clientAddressKey(req.ip ?? req.socket.remoteAddress);
}
