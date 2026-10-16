import { apiFetch, ApiError } from '@game-feedback/sdk';
export { ApiError };
export type {
  User,
  Author,
  Category,
  Card,
  GameProfile,
  Post,
  Answer,
  Comment,
  Session,
  PostDetail,
  Notification,
  NotificationList,
} from '@game-feedback/contracts';
export type { PostList as PostPage } from '@game-feedback/contracts';
const errorMessages: Record<string, string> = {
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
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    return await apiFetch<T>(`/api${path}`, options);
  } catch (error) {
    if (error instanceof ApiError)
      throw new ApiError(error.status, error.errorCode, errorMessages[error.errorCode] || error.message);
    throw new Error('서버에 연결하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.');
  }
}
export function json(method: string, data?: unknown): RequestInit {
  return { method, ...(data === undefined ? {} : { body: JSON.stringify(data) }) };
}
export function timeAgo(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(value).toLocaleDateString('ko-KR');
}
