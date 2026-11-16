import { describe, expect, it } from 'vitest';

import { parseSearch, parseSearchValues } from './query-string';

describe('parseSearch', () => {
  it('같은 키는 첫 값만 읽어야 한다', () => {
    expect(parseSearch('?next=a&next=b')).toEqual({ next: 'a' });
  });

  it('대괄호 키로 객체나 배열을 만들지 않아야 한다', () => {
    expect(parseSearch('?next[x]=y').next).toBeUndefined();
    expect(parseSearch('?next[]=a&next[]=b').next).toBeUndefined();
    expect(parseSearch('?next[]=a&next[]=b')).toEqual({});
    expect(parseSearch('?a[b][c]=d')).toEqual({ 'a[b][c]': 'd' });
  });

  it('감싼 대괄호 키가 같은 키와 합쳐져도 값을 넘기지 않아야 한다', () => {
    expect(parseSearch('?[next]=//evil.example&next=/safe').next).toBeUndefined();
  });

  it('앞의 물음표와 물음표 없는 입력을 같게 읽어야 한다', () => {
    expect(parseSearch('?q=hog')).toEqual({ q: 'hog' });
    expect(parseSearch('q=hog')).toEqual({ q: 'hog' });
  });

  it('빈 입력은 빈 결과여야 한다', () => {
    expect(parseSearch('')).toEqual({});
    expect(parseSearch('?')).toEqual({});
  });

  it('인코딩된 값을 URLSearchParams와 같게 풀어야 한다', () => {
    expect(parseSearch('?q=%ED%98%B8%EA%B7%B8+%26%20ice')).toEqual({ q: '호그 & ice' });
    expect(parseSearch('?q=%ED%98%B8%EA%B7%B8+%26%20ice').q).toBe(
      new URLSearchParams('?q=%ED%98%B8%EA%B7%B8+%26%20ice').get('q'),
    );
  });

  it('값 안의 대괄호와 등호가 키를 바꾸지 않아야 한다', () => {
    expect(parseSearch('?next=a]=b')).toEqual({ next: 'a]=b' });
    expect(parseSearch('?next=a%5D=b')).toEqual({ next: 'a]=b' });
    expect(parseSearch('?a=b=c')).toEqual({ a: 'b=c' });
  });

  it('파라미터가 많아도 뒤의 값을 놓치지 않아야 한다', () => {
    expect(parseSearch(`?${'a&'.repeat(1001)}next=/x`).next).toBe('/x');
  });

  it('프로토타입 이름을 키로 받아도 객체 기본 멤버를 값으로 돌려주지 않아야 한다', () => {
    expect(parseSearch('?__proto__=x&toString=y')).toEqual({});
    expect(Object.getPrototypeOf(parseSearch('?__proto__=x'))).toBe(Object.prototype);
  });
});

describe('parseSearchValues', () => {
  it('중복 키의 값을 순서대로 모아야 한다', () => {
    expect(parseSearchValues('?tag=a&view=compact&tag=b')).toEqual({ tag: ['a', 'b'], view: ['compact'] });
  });

  it('값이 많아도 객체로 바뀌지 않아야 한다', () => {
    const tags = Array.from({ length: 25 }, (_, index) => `${index}`);
    expect(parseSearchValues(`?${tags.map((tag) => `tag=${tag}`).join('&')}`).tag).toEqual(tags);
  });

  it('빈 입력은 빈 결과여야 한다', () => {
    expect(parseSearchValues('')).toEqual({});
  });
});
