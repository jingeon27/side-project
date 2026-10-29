import { describe, expect, expectTypeOf, it } from 'vitest';

import { groupResponse, invalidationResponse, mediaPlanResponse, parseJson } from './response';

describe('공유 배포의 응답 타입 추론', () => {
  it('검증 함수의 반환값으로 JSON 결과의 필드를 추론해야 한다', () => {
    const group = parseJson('{"data":{"createGroup":{"id":"group-id"}}}', groupResponse);
    expectTypeOf(group.id).toEqualTypeOf<string>();
    expect(group.id).toBe('group-id');
  });

  it('타입이 맞지 않는 응답을 정상 업로드 계획으로 취급하지 않아야 한다', () => {
    expect(() => parseJson('{"id":123,"url":"https://storage.test"}', mediaPlanResponse)).toThrow();
    expect(() => parseJson('{"data":{"createGroup":null}}', groupResponse)).toThrow();
  });

  it('최초 SSE 동기화의 null과 후속 대화 ID를 구분해야 한다', () => {
    const initial = invalidationResponse({ conversationId: null });
    const next = invalidationResponse({ conversationId: 'conversation-id' });
    expectTypeOf(initial.conversationId).toEqualTypeOf<string | null>();
    expect(initial.conversationId).toBeNull();
    expect(next.conversationId).toBe('conversation-id');
  });
});
