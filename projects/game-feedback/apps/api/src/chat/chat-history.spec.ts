import { describe, expect, it } from 'vitest';

import { advancesBoundary, historyBoundary, historyWhere } from './chat-history';

const at = new Date('2026-10-19T01:00:00.000Z');
const row = {
  firstUserId: 'first',
  firstClearedAt: at,
  firstClearedId: 'message-b',
  secondClearedAt: null,
  secondClearedId: null,
};

describe('채팅 기록 경계', () => {
  it('내가 지운 기록의 경계를 상대방에게 적용하지 않아야 한다', () => {
    expect(historyBoundary(row, 'first')).toEqual({ at, id: 'message-b' });
    expect(historyBoundary(row, 'second')).toEqual({ at: null, id: null });
    expect(historyWhere(row, 'second')).toEqual({});
  });
  it('같은 시각에 저장된 메시지는 ID까지 비교해 조회해야 한다', () => {
    expect(historyWhere(row, 'first')).toEqual({
      OR: [{ createdAt: { gt: at } }, { createdAt: at, id: { gt: 'message-b' } }],
    });
  });
  it.each([
    { id: 'message-z', time: at.getTime() - 1, visible: false },
    { id: 'message-a', time: at.getTime(), visible: false },
    { id: 'message-b', time: at.getTime(), visible: false },
    { id: 'message-c', time: at.getTime(), visible: true },
    { id: 'message-a', time: at.getTime() + 1, visible: true },
  ])('삭제 경계 뒤의 메시지만 유효한 재전송으로 처리해야 한다: $id / $time', ({ id, time, visible }) => {
    expect(advancesBoundary({ id, createdAt: new Date(time) }, historyBoundary(row, 'first'))).toBe(visible);
  });
  it('삭제 경계가 없으면 과거 메시지도 읽을 수 있어야 한다', () => {
    expect(advancesBoundary({ id: 'old', createdAt: new Date(0) }, { at: null, id: null })).toBe(true);
  });
  it('기존 데이터에 경계 ID가 없으면 같은 시각의 메시지를 ID 순서로 처리해야 한다', () => {
    const boundary = { at, id: null };
    expect(advancesBoundary({ id: 'message-a', createdAt: new Date(at) }, boundary)).toBe(true);
    expect(historyWhere({ ...row, firstClearedId: null }, 'first')).toEqual({
      OR: [{ createdAt: { gt: at } }, { createdAt: at, id: { gt: '' } }],
    });
  });
});
