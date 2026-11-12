import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import { PostInputSchema } from '@game-feedback/contracts';

import { isSamePostRequest } from './post-request';

const input = PostInputSchema.parse({
  categoryId: 'clash-royale',
  board: 'COACHING',
  title: '응답이 끊긴 코칭 글',
  body: '같은 초안을 다시 보내요',
  document: { ops: [{ insert: '같은 초안을 다시 보내요', attributes: { bold: true } }, { insert: '\n' }] },
  coaching: { role: 'COACH', pricing: { type: 'GOAL', amount: 50000, targetScore: '9000' } },
  clientRequestId: '00000000-0000-4000-8000-000000000001',
});
// DB의 JSON 열은 키 순서를 바꿔 돌려준다. 처음 저장한 글을 흉내 낸다.
const stored = {
  categoryId: 'clash-royale',
  board: 'COACHING',
  title: input.title,
  body: input.body,
  document: { ops: [{ attributes: { bold: true }, insert: '같은 초안을 다시 보내요' }, { insert: '\n' }] },
  coaching: { pricing: { targetScore: '9000', amount: 50000, type: 'GOAL' }, role: 'COACH' },
  friendSale: null,
  battle: null,
  hidden: false,
  deletedAt: null,
};

describe('게시글 요청 키 재사용', () => {
  it('응답만 끊긴 같은 초안의 재시도는 처음 저장한 글로 본다', () => {
    expect(isSamePostRequest(stored, input, 'clash-royale')).toBe(true);
    const plain = PostInputSchema.parse({ categoryId: 'clash-royale', title: '평문 글쓰기', body: '본문' });
    expect(
      isSamePostRequest(
        {
          ...stored,
          board: 'FEEDBACK',
          title: plain.title,
          body: plain.body,
          document: null,
          coaching: null,
        },
        plain,
        'clash-royale',
      ),
    ).toBe(true);
  });

  it.each([
    ['제목이', { title: '고친 제목' }],
    ['본문이', { body: '고친 본문' }],
    ['서식이', { document: { ops: [{ insert: '같은 초안을 다시 보내요' }, { insert: '\n' }] } }],
    ['코칭 조건이', { coaching: { role: 'STUDENT', pricing: { type: 'HOURLY', amount: null } } }],
    ['분류가', { board: 'FREE' }],
  ])('%s 바뀐 요청은 같은 글로 보지 않는다', (_name, patch) => {
    expect(isSamePostRequest({ ...stored, ...patch }, input, 'clash-royale')).toBe(false);
  });

  it('다른 게임이나 숨김·삭제된 글은 같은 요청의 결과로 돌려주지 않는다', () => {
    expect(isSamePostRequest(stored, input, 'brawl-stars')).toBe(false);
    expect(isSamePostRequest({ ...stored, hidden: true }, input, 'clash-royale')).toBe(false);
    expect(isSamePostRequest({ ...stored, deletedAt: dayjs(0).toDate() }, input, 'clash-royale')).toBe(false);
  });
});
