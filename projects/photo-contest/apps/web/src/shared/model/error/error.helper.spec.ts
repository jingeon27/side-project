import { CombinedGraphQLErrors, ServerError, ServerParseError } from '@apollo/client/errors';
import { describe, expect, it } from 'vitest';

import { BridgeError } from '@photo-contest/bridge/web';

import { DEFAULT_ERROR_MESSAGE, ensureOk, getErrorCode, getErrorMessage, RequestError } from './error.helper';

function graphqlErrors(...errors: Array<{ message: string; code?: string }>) {
  return new CombinedGraphQLErrors({
    data: null,
    errors: errors.map(({ message, code }) => ({ message, extensions: code ? { code } : undefined })),
  });
}

function serverError(status: number, body: string) {
  return new ServerError('Response not successful', {
    response: new Response(body, { status }),
    bodyText: body,
  });
}

describe('getErrorMessage', () => {
  it('API가 code와 함께 보낸 GraphQL 안내문을 그대로 보여 줘야 한다', () => {
    const error = graphqlErrors({ message: '이미 제출하거나 투표했습니다.', code: 'CONFLICT' });
    expect(getErrorMessage(error)).toBe('이미 제출하거나 투표했습니다.');
    expect(getErrorCode(error)).toBe('CONFLICT');
  });

  it('스키마 검증처럼 기술적인 GraphQL 오류는 fallback으로 바꿔야 한다', () => {
    const error = graphqlErrors({
      message: 'Cannot query field "x" on type "Query".',
      code: 'GRAPHQL_VALIDATION_FAILED',
    });
    expect(getErrorMessage(error)).toBe(DEFAULT_ERROR_MESSAGE);
    expect(getErrorMessage(error, '사진을 불러오지 못했어요.')).toBe('사진을 불러오지 못했어요.');
    expect(getErrorCode(error)).toBeNull();
  });

  it('HTTP 오류는 본문의 안내문이나 상태에 맞는 문장을 보여 줘야 한다', () => {
    expect(getErrorMessage(serverError(403, '{"message":"허용되지 않은 요청 출처입니다."}'))).toBe(
      '허용되지 않은 요청 출처입니다.',
    );
    expect(getErrorMessage(serverError(502, '<html>Bad Gateway</html>'))).toBe(
      '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
    );
    expect(
      getErrorMessage(
        serverError(
          400,
          '{"errors":[{"message":"먼저 로그인해 주세요.","extensions":{"code":"UNAUTHENTICATED"}}]}',
        ),
      ),
    ).toBe('먼저 로그인해 주세요.');
    expect(getErrorCode(serverError(401, ''))).toBe('UNAUTHENTICATED');
    expect(
      getErrorMessage(
        new ServerParseError(new Error('bad json'), { response: new Response('x'), bodyText: 'x' }),
      ),
    ).toBe('서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
  });

  it('네트워크 실패·REST·브리지 오류를 사람이 읽을 문장으로 바꿔야 한다', () => {
    expect(getErrorMessage(new TypeError('Failed to fetch'))).toBe(
      '네트워크 연결을 확인하고 다시 시도해 주세요.',
    );
    expect(getErrorMessage(new TypeError('Load failed'))).toBe(
      '네트워크 연결을 확인하고 다시 시도해 주세요.',
    );
    expect(getErrorMessage(new RequestError('앱 로그인 요청을 확인할 수 없습니다.', 403))).toBe(
      '앱 로그인 요청을 확인할 수 없습니다.',
    );
    expect(getErrorMessage(new BridgeError('TIMEOUT', '앱이 응답하지 않습니다.'))).toBe(
      '앱이 응답하지 않습니다.',
    );
  });

  it('예상하지 못한 오류의 원문은 노출하지 않아야 한다', () => {
    expect(getErrorMessage(new Error('Cannot read properties of undefined'))).toBe(DEFAULT_ERROR_MESSAGE);
    expect(getErrorMessage('boom')).toBe(DEFAULT_ERROR_MESSAGE);
  });
});

describe('ensureOk', () => {
  it('성공 응답은 그대로 돌려주고 실패면 서버 안내문으로 RequestError를 던져야 한다', async () => {
    const ok = new Response('{}', { status: 200 });
    await expect(ensureOk(ok)).resolves.toBe(ok);
    await expect(
      ensureOk(new Response('{"message":"앱 로그인 요청을 확인할 수 없습니다."}', { status: 403 })),
    ).rejects.toMatchObject({
      name: 'RequestError',
      status: 403,
      message: '앱 로그인 요청을 확인할 수 없습니다.',
    });
    await expect(ensureOk(new Response('oops', { status: 500 }))).rejects.toMatchObject({
      status: 500,
      message: DEFAULT_ERROR_MESSAGE,
    });
  });
});
