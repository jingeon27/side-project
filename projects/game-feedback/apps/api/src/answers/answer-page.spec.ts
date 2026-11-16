import { describe, expect, it } from 'vitest';

import { afterAnswer, decodeAnswerCursor, encodeAnswerCursor } from './answer-page';

const createdAt = new Date('2026-10-27T01:02:03.004Z');

describe('answer page cursor', () => {
  it('round-trips the helpful flag, time and id of the last answer', () => {
    const position = { helpful: true, createdAt, id: 'answer-1' };
    expect(decodeAnswerCursor(encodeAnswerCursor(position))).toEqual(position);
    expect(decodeAnswerCursor(undefined)).toBeNull();
  });

  it.each([
    'broken',
    Buffer.from(JSON.stringify([createdAt.toISOString(), 'answer-1'])).toString('base64url'),
    Buffer.from(JSON.stringify(['true', createdAt.toISOString(), 'answer-1'])).toString('base64url'),
    Buffer.from(JSON.stringify([false, 'not-a-date', 'answer-1'])).toString('base64url'),
    Buffer.from(JSON.stringify([false, createdAt.toISOString(), ''])).toString('base64url'),
  ])('rejects %s as INVALID_CURSOR', (value) => {
    expect(() => decodeAnswerCursor(value)).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ errorCode: 'INVALID_CURSOR' }) }),
    );
  });

  it('continues inside the helpful group before every unhelpful answer', () => {
    const later = {
      OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: 'answer-1' } }],
    };
    expect(afterAnswer({ helpful: true, createdAt, id: 'answer-1' })).toEqual({
      OR: [{ helpful: true, ...later }, { helpful: false }],
    });
    expect(afterAnswer({ helpful: false, createdAt, id: 'answer-1' })).toEqual({ helpful: false, ...later });
  });
});
