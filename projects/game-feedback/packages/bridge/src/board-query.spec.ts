import { describe, expect, it } from 'vitest';

import { BoardQuerySchema } from './board-query';
import { resolveAppRoute } from './routes';

const queryString = (values: Record<string, string | undefined>) =>
  Object.entries(values)
    .filter((entry) => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${encodeURIComponent(value ?? '')}`)
    .join('&');

describe('게시판 경로 입력 계약', () => {
  it('게시판 미선택과 명시적인 게임 선택을 구분해야 한다', () => {
    expect(BoardQuerySchema.parse({})).toEqual({ game: 'clash-royale' });
    expect(BoardQuerySchema.parse({ game: 'brawl-stars' })).toEqual({ game: 'brawl-stars' });
  });

  it.each(['feedback', 'friend-sale', 'friendly', 'coaching', 'free'])(
    '%s 게시판에서 그 게시판에 속한 필터만 허용해야 한다',
    (board) => {
      for (const battleMode of [undefined, 'DUEL']) {
        for (const coachingRole of [undefined, 'COACH']) {
          for (const feedbackStatus of [undefined, 'WAITING']) {
            const expected =
              (!battleMode || board === 'friendly') &&
              (!coachingRole || board === 'coaching') &&
              (!feedbackStatus || board === 'feedback');
            const filters = { board, battleMode, coachingRole, feedbackStatus };
            expect(BoardQuerySchema.safeParse(filters).success).toBe(expected);
            expect(resolveAppRoute(`/ko/search?${queryString(filters)}`) !== null).toBe(expected);
            expect(
              resolveAppRoute(`/ko/boards/${board}?${queryString({ ...filters, board: undefined })}`) !==
                null,
            ).toBe(expected);
          }
        }
      }
    },
  );

  it.each([
    { board: ['friendly'] },
    { board: '' },
    { board: 'missing' },
    { board: null },
    { game: ['clash-royale'] },
    { game: '../escape' },
    { battleMode: 'DUEL' },
    { board: 'friendly', battleMode: ['DUEL'] },
    { board: 'friendly', battleMode: 'unknown' },
    { board: 'coaching', coachingRole: ['COACH'] },
    { board: 'feedback', feedbackStatus: 'unknown' },
  ])('잘못된 입력 %j를 느슨한 기본값으로 바꾸지 않아야 한다', (input) => {
    expect(BoardQuerySchema.safeParse(input).success).toBe(false);
  });

  it.each([
    ['friendly', 'battleMode', 'DUEL'],
    ['coaching', 'coachingRole', 'STUDENT'],
  ])('글쓰기의 %s 필터와 상위 게시판을 보존해야 한다', (board, field, value) => {
    const query = { board, game: 'brawl-stars', [field]: value };
    expect(resolveAppRoute(`/en/write?${queryString(query)}`)).toMatchObject({
      screen: 'compose',
      game: 'brawl-stars',
      parent: `/en/boards/${board}?game=brawl-stars&${field}=${value}`,
    });
    expect(resolveAppRoute(`/en/write?${queryString({ ...query, board: 'free' })}`)).toBeNull();
  });
});
