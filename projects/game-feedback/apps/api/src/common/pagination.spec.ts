import { describe, expect, it } from 'vitest';

import { ApiError } from './http/api-error';
import { decodeCursor, encodeCursor, nextCursor, nextPageAnchor } from './pagination';

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('Repository 목록 커서', () => {
  it('같은 시각의 항목을 구분할 ID와 밀리초를 보존해야 한다', () => {
    const row = { id: 'post-with-same-time', createdAt: new Date('2026-10-19T01:02:03.456Z') };
    const cursor = encodeCursor(row);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor)).toEqual(row);
  });
  it.each([undefined, ''])('커서가 없으면 첫 페이지로 처리해야 한다: %j', (value) => {
    expect(decodeCursor(value)).toBeNull();
  });
  it.each([
    'not-json',
    encode({ createdAt: '2026-10-19', id: 'post' }),
    encode(['invalid-date', 'post']),
    encode([123, 'post']),
    encode(['2026-10-19', 123]),
    encode(['2026-10-19', '']),
    encode(['2026-10-19']),
    encode(['2026-10-19', 'post', 'extra']),
  ])('잘못된 커서는 DB 조회 전에 INVALID_CURSOR로 거부해야 한다: %s', (value) => {
    try {
      decodeCursor(value);
      expect.unreachable('잘못된 커서를 거부해야 한다');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      if (!(error instanceof ApiError)) throw error;
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({ errorCode: 'INVALID_CURSOR' });
    }
  });
});
describe('limit+1 조회의 다음 페이지 커서', () => {
  const rows = [0, 1, 2].map((index) => ({
    id: `row-${index}`,
    createdAt: new Date(Date.UTC(2026, 9, 19, 0, 0, index)),
  }));
  it('한 건이 더 있으면 이 페이지의 마지막 항목으로 커서를 만들어야 한다', () => {
    expect(nextPageAnchor(rows, 2)).toBe(rows[1]);
    expect(decodeCursor(nextCursor(rows, 2) ?? undefined)).toEqual(rows[1]);
  });
  it.each([3, 4])('다음 페이지가 없으면 커서를 만들지 않아야 한다: limit %i', (limit) => {
    expect(nextPageAnchor(rows, limit)).toBeUndefined();
    expect(nextCursor(rows, limit)).toBeNull();
  });
});
