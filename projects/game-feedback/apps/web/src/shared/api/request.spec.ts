import { describe, expect, it } from 'vitest';

import { ApiResponseValidationError } from '@game-feedback/sdk';

import { ApiError, withApiError } from './request';

describe('REST error presentation boundary', () => {
  it('retains stable server metadata while translating the displayed message', async () => {
    const failure = new ApiError(404, 'PLAYER_NOT_FOUND', 'Player was not found');
    await expect(withApiError(Promise.reject(failure))).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      errorCode: 'PLAYER_NOT_FOUND',
      message: '플레이어를 찾지 못했어요. 태그를 확인해 주세요.',
    });
  });

  it('uses the network fallback while preserving cancellation errors unchanged', async () => {
    await expect(withApiError(Promise.reject(new TypeError('Failed to fetch')))).rejects.toThrow(
      '서버에 연결하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.',
    );
    const cancelled = new DOMException('The operation was aborted', 'AbortError');
    await expect(withApiError(Promise.reject(cancelled))).rejects.toBe(cancelled);
  });
});

it('shows a distinct response validation error instead of the network fallback', async () => {
  const failure = new ApiResponseValidationError(200);
  await expect(withApiError(Promise.reject(failure))).rejects.toBe(failure);
  await expect(withApiError(Promise.reject(failure))).rejects.toMatchObject({
    status: 200,
    errorCode: 'INVALID_API_RESPONSE',
    message: '서버 응답을 확인하지 못했어요. 새로고침 후 내용을 확인해 주세요.',
  });
});
