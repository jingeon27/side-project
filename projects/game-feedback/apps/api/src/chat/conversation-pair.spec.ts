import { describe, expect, it } from 'vitest';

import { conversationPair } from './conversation-pair';

describe('1:1 대화 사용자 쌍', () => {
  it('누가 시작해도 같은 순서의 쌍을 만들어야 한다', () => {
    const expected = { firstUserId: 'cuser-a', secondUserId: 'cuser-b' };
    expect(conversationPair('cuser-a', 'cuser-b')).toEqual(expected);
    expect(conversationPair('cuser-b', 'cuser-a')).toEqual(expected);
  });
  it('기존 Array.sort와 같은 UTF-16 코드 단위 순서를 따라야 한다', () => {
    expect(['user-a', 'user-Z'].sort()).toEqual(['user-Z', 'user-a']);
    expect(conversationPair('user-a', 'user-Z')).toEqual({ firstUserId: 'user-Z', secondUserId: 'user-a' });
  });
});
