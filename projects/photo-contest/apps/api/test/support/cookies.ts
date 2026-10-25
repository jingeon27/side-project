import type { Response } from 'supertest';

/** 응답의 Set-Cookie 헤더 전부 */
export function setCookies(response: Response): string[] {
  const header: string | string[] | undefined = response.headers['set-cookie'];
  return header === undefined ? [] : [header].flat();
}

/** name 쿠키를 설정하거나 지우는 Set-Cookie 한 줄 */
export function findSetCookie(response: Response, name: string): string | undefined {
  return setCookies(response)
    .filter((cookie) => cookie.startsWith(`${name}=`))
    .at(-1);
}

/** Set-Cookie에서 요청 Cookie 헤더에 넣을 `name=value`만 뗀다. */
export function cookiePair(setCookie: string): string {
  return setCookie.split(';')[0] ?? '';
}

/** Set-Cookie의 값 부분 */
export function cookieValue(setCookie: string): string {
  const pair = cookiePair(setCookie);
  return pair.slice(pair.indexOf('=') + 1);
}

/** `HttpOnly`, `SameSite=Lax`처럼 값 뒤에 붙은 속성들 */
export function cookieAttributes(setCookie: string): string[] {
  return setCookie
    .split(';')
    .slice(1)
    .map((attribute) => attribute.trim());
}

/** 브라우저가 쿠키를 지우게 하는 Set-Cookie인지 (만료일이 과거) */
export function isClearingCookie(setCookie: string): boolean {
  const expires = cookieAttributes(setCookie).find((attribute) => attribute.startsWith('Expires='));
  return cookieValue(setCookie) === '' && expires !== undefined && Date.parse(expires.slice(8)) < Date.now();
}
