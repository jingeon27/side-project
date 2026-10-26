import assert from 'node:assert/strict';
import type { IncomingHttpHeaders } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

/** 부하 검사 직후의 제한은 Retry-After 한 번만 기다리고, 오류 응답은 세션으로 해석하지 않는다. */
interface ISessionResponse {
  status: number | undefined;
  headers: IncomingHttpHeaders;
  text(): string;
}

export async function assertAnonymousSession(
  read: () => Promise<ISessionResponse>,
  wait: (milliseconds: number) => Promise<unknown> = delay,
) {
  const first = await read();
  const retry = async () => {
    const seconds = Number(first.headers['retry-after']);
    assert.ok(Number.isInteger(seconds) && seconds > 0 && seconds <= 60, 'Expected bounded Retry-After');
    await wait(seconds * 1000);
    return read();
  };
  const response = first.status === 429 ? await retry() : first;
  assert.equal(response.status, 200, response.text());
  const body: unknown = JSON.parse(response.text());
  assert.ok(typeof body === 'object' && body !== null && 'user' in body);
  assert.equal(body.user, null);
}
