import { expect, it } from 'vitest';

import { activitySchema } from './activity';

const stamp = { id: 'a'.repeat(64), createdAt: '2026-10-12T12:00:00.000Z', date: '2026-10-12' };
const page = {
  kind: 'reading',
  topic: 'job',
  concern: 'silence',
  element: 'metal',
  reading: { mode: 'basic', interpretation: '친구에게 오늘 쓴 첫 문장을 읽어보세요.' },
};

it('accepts an archived reading without birth data and rejects raw birth and experience fields', () => {
  expect(activitySchema.safeParse({ ...stamp, page }).success).toBe(true);
  for (const extra of [{ date: '1991-02-05' }, { time: '07:30' }, { pastExperience: '비공개 원문' }])
    expect(activitySchema.safeParse({ ...stamp, page: { ...page, ...extra } }).success).toBe(false);
  expect(
    activitySchema.safeParse({ ...stamp, page: { ...page, concern: 'not-a-listed-concern' } }).success,
  ).toBe(false);
});

it('keeps the message length, published episode and date within the journal contract', () => {
  const message = { kind: 'message', episode: 'baek-beonjjae-jiwonseo', text: '한 문장부터 시작하자' };
  expect(activitySchema.safeParse({ ...stamp, page: message }).success).toBe(true);
  expect(activitySchema.safeParse({ ...stamp, page: { ...message, episode: 'unpublished' } }).success).toBe(
    false,
  );
  expect(activitySchema.safeParse({ ...stamp, page: { ...message, text: '가'.repeat(241) } }).success).toBe(
    false,
  );
  expect(activitySchema.safeParse({ ...stamp, date: '2026-02-31', page: message }).success).toBe(false);
});
