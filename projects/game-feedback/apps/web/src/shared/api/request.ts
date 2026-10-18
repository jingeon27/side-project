import { ApiError, ApiResponseValidationError } from '@game-feedback/sdk';
export { ApiError };
export type * from '@game-feedback/contracts';
export type { PostList as PostPage } from '@game-feedback/contracts';
const errorMessages: Record<string, string> = {
  INVALID_API_RESPONSE: '서버 응답을 확인하지 못했어요. 새로고침 후 내용을 확인해 주세요.',
  AUTH_REQUIRED: '로그인 후 이용할 수 있어요.',
  FORBIDDEN: '이 작업을 할 권한이 없어요.',
  NOT_FOUND: '요청한 내용을 찾을 수 없어요.',
  VALIDATION_ERROR: '입력한 내용을 다시 확인해 주세요.',
  RATE_LIMITED: '요청이 잠시 많아요. 조금 뒤에 다시 시도해 주세요.',
  PLAYER_NOT_FOUND: '플레이어를 찾지 못했어요. 태그를 확인해 주세요.',
  SUPERCELL_UNAVAILABLE: '게임 프로필을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  GOOGLE_NOT_CONFIGURED: '아직 Google 로그인이 연결되지 않았어요.',
  NICKNAME_TAKEN: '이미 사용 중인 닉네임이에요.',
};
export async function withApiError<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    if (error instanceof ApiResponseValidationError) throw error;
    if (error instanceof ApiError)
      throw new ApiError(error.status, error.errorCode, errorMessages[error.errorCode] || error.message);
    throw new Error('서버에 연결하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.');
  }
}
