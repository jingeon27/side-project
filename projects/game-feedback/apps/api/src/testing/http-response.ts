import type { Response } from 'supertest';

// superagent는 헤더를 string 색인으로 선언한다. 없는 Location과 여러 값의 Set-Cookie를 테스트에서 명시적으로 검사한다.
export function responseLocation(response: Response): string {
  const location = response.get('Location');
  if (!location) throw new Error(`Expected a Location header on HTTP ${response.status}.`);
  return location;
}

export function responseCookies(response: Response): string[] {
  const cookies: unknown = response.headers['set-cookie'];
  if (!Array.isArray(cookies)) throw new Error(`Expected Set-Cookie headers on HTTP ${response.status}.`);
  return cookies.filter((cookie): cookie is string => typeof cookie === 'string');
}
