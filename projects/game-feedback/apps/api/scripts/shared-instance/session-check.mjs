import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

/** 부하 검사 직후의 제한은 Retry-After 한 번만 기다리고, 오류 응답은 세션으로 해석하지 않는다. */
export async function assertAnonymousSession(read, wait = delay) {
  let response = await read();
  if (response.status === 429) {
    const seconds = Number(response.headers['retry-after']);
    assert.ok(Number.isInteger(seconds) && seconds > 0 && seconds <= 60, 'Expected bounded Retry-After');
    await wait(seconds * 1000);
    response = await read();
  }
  assert.equal(response.status, 200, response.text());
  assert.equal(response.json().user, null);
}
