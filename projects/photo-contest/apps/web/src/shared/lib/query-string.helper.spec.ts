import { describe, expect, it } from 'vitest';

import { getSafeNextPath } from './login-redirect.helper';
import { parseSearch, updateSearch } from './query-string.helper';

describe('parseSearch', () => {
  it('같은 키는 첫 값만 읽어야 한다', () => {
    expect(parseSearch('?next=a&next=b')).toEqual({ next: 'a' });
  });

  it('대괄호 키로 객체나 배열을 만들지 않아야 한다', () => {
    expect(parseSearch('?next[x]=y').next).toBeUndefined();
    expect(parseSearch('?next[]=a&next[]=b').next).toBeUndefined();
    expect(parseSearch('?next[]=a&next[]=b')).toEqual({});
  });

  it('감싼 대괄호 키가 어떤 형태로 들어와도 안전한 경로만 남아야 한다', () => {
    expect(parseSearch('?[next]=/me&next=/groups').next).toBeUndefined();
    expect(getSafeNextPath(parseSearch('?[next]=//evil.example').next)).toBe('/');
  });

  it('앞의 물음표와 물음표 없는 입력을 같게 읽어야 한다', () => {
    expect(parseSearch('?v=abc')).toEqual({ v: 'abc' });
    expect(parseSearch('v=abc')).toEqual({ v: 'abc' });
  });

  it('빈 입력은 빈 결과여야 한다', () => {
    expect(parseSearch('')).toEqual({});
    expect(parseSearch('?')).toEqual({});
  });

  it('인코딩된 값을 URLSearchParams와 같게 풀어야 한다', () => {
    const search = '?next=%2Fgroups%2Fg1%3Fa%3D1%26b%3D%EC%83%81%EC%9E%90+%EB%B3%B5%EC%96%B4';
    expect(parseSearch(search).next).toBe('/groups/g1?a=1&b=상자 복어');
    expect(parseSearch(search).next).toBe(new URLSearchParams(search).get('next'));
  });

  it('값 안의 대괄호와 등호가 키를 바꾸지 않아야 한다', () => {
    expect(parseSearch('?next=/a]=b')).toEqual({ next: '/a]=b' });
  });

  it('파라미터가 많아도 뒤의 값을 놓치지 않아야 한다', () => {
    expect(parseSearch(`?${'a&'.repeat(1001)}next=/x`).next).toBe('/x');
  });
});

describe('updateSearch', () => {
  it('주어진 키만 바꾸고 다른 키의 순서와 중복을 보존해야 한다', () => {
    expect(updateSearch('?sort=latest&tag=a&tag=b&page=2', { sort: 'popular', page: null })).toBe(
      '?sort=popular&tag=a&tag=b',
    );
  });

  it('새 키는 뒤에 붙이고 값을 인코딩해야 한다', () => {
    expect(updateSearch('?sort=latest', { q: '상자 복어&' })).toBe(
      '?sort=latest&q=%EC%83%81%EC%9E%90%20%EB%B3%B5%EC%96%B4%26',
    );
  });

  it('모든 키를 지우면 물음표를 남기지 않아야 한다', () => {
    expect(updateSearch('?q=old', { q: null })).toBe('');
    expect(updateSearch('', { q: undefined })).toBe('');
  });

  it('값이 많은 중복 키도 대괄호 키로 바꾸지 않아야 한다', () => {
    const tags = Array.from({ length: 25 }, (_, index) => `tag=${index}`).join('&');
    expect(updateSearch(`?${tags}`, {})).toBe(`?${tags}`);
  });
});
