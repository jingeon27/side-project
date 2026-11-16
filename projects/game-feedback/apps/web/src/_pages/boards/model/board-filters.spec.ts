import { describe, expect, it } from 'vitest';

import { boardSnapshotSearch, readBoardFilters } from './board-filters';
import type { IBoardSnapshot } from './board-snapshot.type';

const snapshot = (values: Partial<IBoardSnapshot>) =>
  ({ game: { slug: 'clash-royale' }, posts: {}, q: '', ...values }) as IBoardSnapshot;

describe('게시판 검색 문자열', () => {
  it('서버 snapshot의 검색어를 공백까지 그대로 다시 읽어야 한다', () => {
    const search = boardSnapshotSearch(snapshot({ q: '수비 덱 + a&b', battleMode: 'TEAM' }));
    expect(search).toBe('?game=clash-royale&q=%EC%88%98%EB%B9%84%20%EB%8D%B1%20%2B%20a%26b&battleMode=TEAM');
    expect(readBoardFilters(search)).toMatchObject({ q: '수비 덱 + a&b', battleMode: 'TEAM' });
  });

  it('없는 필터는 쿼리에 넣지 않아야 한다', () => {
    expect(boardSnapshotSearch(snapshot({}))).toBe('?game=clash-royale');
  });

  it('브라우저 주소의 공백 표기와 상관없이 같은 필터로 읽어야 한다', () => {
    expect(readBoardFilters('?q=a+b').q).toBe('a b');
    expect(readBoardFilters('?q=a%20b').q).toBe('a b');
  });

  it('중복 키와 대괄호 키를 배열이나 객체로 넘기지 않아야 한다', () => {
    expect(readBoardFilters('?battleMode=TEAM&battleMode=DUEL').battleMode).toBe('TEAM');
    expect(readBoardFilters('?battleMode[x]=TEAM').battleMode).toBeUndefined();
    expect(readBoardFilters('?q[]=a&q[]=b').q).toBe('');
  });
});
